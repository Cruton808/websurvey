//REQUIRE ALL MODULES
const express = require("express");
const session = require("express-session");
const port = process.env.PORT || 10000;
const path = require("path");
const bodyParser = require("body-parser");
const pg = require("pg");

//Start server
var app = express();
const server = require("http").createServer(app);

//Setup Settings for DB, Server & Folders
var io = require("socket.io")(server);
var pF = path.resolve(__dirname, "public");
var sF = path.resolve(__dirname, "scripts");

//postgres
//database url
var pool = new pg.Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'survey_system2',
    password: '1994Daniel',
    max: 20
});

//use body parser
app.use(bodyParser.urlencoded({
    extended: true
}));

//use sessions
app.use(session({
    secret: "survey_code",
    resave: true,
    saveUninitialized: true
}));

function checkLogin(req,resp){
    if(!req.session.name){
        resp.sendFile(pF+"/login.html");
        return false;
    }else{
        return true;
    }
}

function checkPermission(req,permission_level){
    if(req.session.permission == permission_level){
        return true;
    }else{
        return false;
    }
}

function getSurveyFromDB(req,resp,client){
    pool.connect(function (err, client, done) {
        if (err) {
            console.log(err);
            resp.end('FAIL');
        }else{
            // Variables
            var survey_obj = {}; // create survey obj
            survey_obj.questions = []; // array to store question
            var survey_q_id = []; // question id for select answer_option loop
            var survey_answers_id = [];
            var req_department_id = req.body.department_id; // var req_survey_id;

            // start getSurvey function
            getSurvey(err,client,done);
            
        }
        
        
        
        // Combine  question list and answer_option list into survey_obj and RESP
        function combineData(survey_question_list, answer_option_list) {
            var i = 0;
            survey_question_list.forEach(function (Element) {
                Element.answers = answer_option_list[i];
                i++
            });
            survey_obj.questions = survey_question_list;
            // Send Response with survey_obj
            resp.send(survey_obj);
        }
        
        // --- SELECT Survey ---
        function getSurvey(err,client,donw){
            
            // if request survey obj from client
            if (req.body.client || req.session.name == undefined) {
                
                // get survey from db
                client.query("SELECT * FROM survey WHERE isopen = true and department_id = $1", [req_department_id], function (err, result) {
                    done();
                    if (err) {
                        console.log(err);
                        resp.end('FAIL');
                    }
                    if (result.rows.length == 1) {
                        req_survey_id = result.rows[0].id;
                        survey_obj.name = result.rows[0].survey_name;
                        survey_obj.questions = [];
                        getQuestion();
                    } else if (result.rows.length > 1) {
                        resp.send("ERROR: multiple survey found");
                    } else {
                        resp.send("no such survey in this department");
                    }
                });

            // if request survey obj from logined user
            } else if(req.session.name){
                req_survey_id = req.body.survey_id;
                req_department_id = req.session.department;
                // get survey from db
                client.query("SELECT * FROM survey WHERE id = $1 and department_id = $2 and isopen=false and been_published = false", [req_survey_id, req_department_id], function (err, result) {
                    done();
                    if (err) {
                        console.log(err);
                        resp.end('FAIL');
                    }
                    console.log(result.rows.length);
                    if (result.rows.length == 1) {
                        survey_obj.name = result.rows[0].survey_name;
                        survey_obj.questions = [];
                        getQuestion();
                    } else if (result.rows.length > 1) {
                        resp.send("ERROR: multiple survey found");
                    } else {
                        resp.send({
                            status:false,
                            msg:"It is currently publishing, been published or no such survey in your department"});
                    }
                });
            }else{
                resp.send({
                    status:false,
                    msg:"Not logined and not a client"
                })
            }
        }
        
        // --- SELECT Question ---
        function getQuestion() {
            client.query("SELECT * FROM question WHERE survey_id = $1", [req_survey_id], function (err, result) {
                done();
                if (err) {
                    console.log(err);
                    resp.end('FAIL');
                }
                if (result.rows.length > 0) {
                    
                    // append selected questions
                    for (var i = 0; i < result.rows.length; i++) {
                        question_obj = {};
                        question_obj.question = result.rows[i].question_text;
                        question_obj.question_type = result.rows[i].question_type;
                        question_obj.question_image = result.rows[i].question_image;
                        question_obj.answers = [];
                        question_obj.question_column = result.rows[i].question_column;
                        survey_obj.questions.push(question_obj);
                        
                        // push question id to survey_q_id array
                        survey_q_id.push(result.rows[i].id);
                        if (i == (result.rows.length - 1)) {
                            select_answer();
                        }
                    }
                } else {
                    combineData(survey_obj.questions, survey_answers_id);
                }

            });
        }
        
        // --- SELECT answer ---
        function select_answer() {
            var g = 0;
            for (var y = 0; y < survey_q_id.length; y++) {
                client.query("SELECT * FROM answer_option WHERE question_id = $1", [survey_q_id[y]], function (err, result) {
                    done();
                    if (err) {
                        console.log(err)
                        resp.end("FAIL");
                    }
                    var array = [];
                    if (result.rows.length > 0) {
                        var rows = result.rows;

                        for (var x = 0; x < rows.length; x++) {

                            array.push(rows[x].answer_option_text);
                        }
                    }
                    survey_answers_id.push(array);
                    g++
                    if (g == (survey_q_id.length)) {
                        combineData(survey_obj.questions, survey_answers_id);
                    }
                });
            }
        }
    });
}

//redirect scripts to build folder
app.use("/scripts", express.static("build"));

app.use("/images", express.static("images"));

app.use("/styles", express.static("css"));

app.use("/html", express.static("html"));

app.get("/", function (req, resp) {
    resp.sendFile(pF+"/client.html");
});
app.get("/login", function (req, resp) {
    if(checkLogin(req,resp)){
        resp.sendFile(pF + "/main.html");
    }else{
        
    }
    
});
app.get("/create", function (req, resp) {
    resp.sendFile(pF + "/create.html");
});

app.get("/client", function (req, resp) {
    resp.sendFile(pF + "/client.html");
});

app.get("/questions", function (req, resp) {
    resp.sendFile(pF + "/questions.html");
});

app.get("/main", function (req, resp) {
    checkLogin(req,resp);
    resp.sendFile(pF+"/main.html")
});

app.get("/profile", function (req, resp) {
    checkLogin(req,resp);
    resp.sendFile(pF + "/profile.html")
});

app.get("/logout", function (req, resp) {
    req.session.destroy();
    resp.redirect("/");
});

app.post("/client",function(req,resp){
    getSurveyFromDB(req,resp);
});

//login function
app.post("/login", function (req, resp) {
    if(req.session.name){
        resp.sendFile(pF +"/main.html");
    }
    var email = req.body.email;
    var password = req.body.password;

    pool.connect(function (err, client, done) {
        if (err) {
            console.log(err);
            resp.end("FAIL");
        }
        client.query("select (select department_name from department where id = (select department_id from admin where email = $1)),email,department_id,name FROM admin where email=$1 and password=$2", [email, password], function (err, result) {
            done();
            if (err) {
                console.log(err);
                resp.end("FAIL");
            }
            if (result.rows.length > 0) {
                req.session.email = result.rows[0].email;
                req.session.department = result.rows[0].department_id;
                req.session.department_name = result.rows[0].department_name;
                req.session.name = result.rows[0].name;
                req.session.permission  = result.rows[0].permission;
                var obj = {
                    status: "success",
                    user: req.session.name,
                }
                resp.send(obj);
            } else {
                resp.end("FAIL");
            }
        });
    });
});

//app.post("/questions",function(req,resp){
//    pool.connect(function(err, client, done){
//        
//        if(err){
//            console.log(err);
//            resp.send("*Connection to the database failed*");
//        }
//        
//        client.query("SELECT * FROM questions;", [], function(err, result) {
//            
//            if(err) {
//                console.log(err);
//                resp.send("*Connection to the database failed*");
//            }
//            
//            if(result.rows.length > 0) {
//                
//                req.session.qPack = result.rows;
//                
//                for (var i=0; i < req.session.qPack.length; i++) {
//                    client.query("SELECT * FROM " + result.rows[i].a_id + ";", [], function(err, result2) {
//                        if(err) {
//                            console.log(err);
//                            resp.send("*Connection to the database failed*");
//                        }
//                        if(result2.rows.length > 0) {
//                            allAnswers.push(result2.rows);
//                        } else {
//                            resp.send("*Connection to the database failed*");
//                        }
//                    });
//                }
//                client.release();
//                var obj = {
//                    status: "success",
//                    qPack: req.session.qPack,
//                    aArr: allAnswers
//                }
//                allAnswers = [];
//                resp.send(obj);
//                
//            } else {
//                resp.send("*Connection to the database failed*");
//            }
//            
//        });
//    });
//});

//logout
app.post("/logout", function (req, resp) {
    //deletes the session in the db
    req.session.destroy();
    resp.end("success");
});

app.post("/getSession", function (req, resp) {
    if (!req.session.name) {
        resp.sendFile(pF + "/main.html");
    }
    var obj = {
        name: req.session.name,
        department_name: req.session.department_name
    };
    resp.send(obj);
});


// create survey
app.post("/createSurvey", function (req, resp) {
    checkLogin(req,resp);
    var questions = req.body.questions;
    
    // check JSON format
    function validateSurveyTitle(survey_title){
        var survey_title = survey_title.replace(/\s\s+/g, ' ');;
        survey_title= survey_title.trim();
        return survey_title;
    }
    
    var survey_title = validateSurveyTitle(req.body.name);
    
    console.log("QS",req.body.questions);

    pool.connect(function (err, client, done) {
        if (err) {
            console.log(err);
            resp.send("FAIL");
        }
        // ** check if survey Exist in department **
        client.query("SELECT survey_name FROM survey WHERE department_id = $1 and survey_name = $2", [req.session.department, survey_title], function (err, result) {
            done();
            var survey_id; // store survey ID
            if (err) {
                console.log(err);
                return false;
            }
            if (result.rows.length > 0) {
                resp.send("survey name already exist in this department");
            } else {
                // ---- Insert survey data ---- //
                client.query("INSERT INTO survey (survey_name,department_id) VALUES ($1,$2) RETURNING id", [survey_title, req.session.department], function (err, result) {
                    done();
                    if (err) {
                        console.log(err);
                        resp.send("FAIL insert survey");
                    } else {
                        survey_id = result.rows[0].id;
                        // ---- Insert question data ---- //
                        questions.forEach(function (Element) {
                            var question_id; // store question ID
                            // TODO ratingQ
                            if (Element.type == 'ratingQuest') {
                                for(var i=0; i< Element.answers[0].length;i++){
                                    client.query("INSERT INTO question (question_type, question_text, survey_id, question_image,question_column) VALUES ($1,$2,$3,$4,$5) RETURNING id", [Element.type, Element.question, survey_id, Element.questionImage,Element.answers[0][i]], function (err, result) {
                                        done();
                                        if (err) {
                                            console.log(err);
                                            resp.send("FAIL insert question");
                                        } else {
                                            question_id = result.rows[0].id;
                                            // ---- Insert answer option data ---- //
                                            if (Element.answers != undefined) {
                                                Element.answers[1].forEach(function (ans_element) {
                                                    client.query("INSERT INTO answer_option (answer_option_text,question_id) VALUES ($1,$2)", [ans_element, question_id], function (err, result) {
                                                        done();
                                                        if (err) {
                                                            console.log(err);
                                                            resp.send('FAIL insert answer option');
                                                        }
                                                    });
                                                });
                                            }

                                        }
                                    });
                                }
                                
                            } else {
                                client.query("INSERT INTO question (question_type, question_text, survey_id, question_image) VALUES ($1,$2,$3,$4) RETURNING id", [Element.type, Element.question, survey_id, Element.questionImage], function (err, result) {
                                    done();
                                    if (err) {
                                        console.log(err);
                                        resp.send("FAIL insert question");
                                    } else {
                                        question_id = result.rows[0].id;
                                        // ---- Insert answer option data ---- //
                                        if (Element.answers != undefined) {
                                            Element.answers.forEach(function (ans_element) {
                                                client.query("INSERT INTO answer_option (answer_option_text,question_id) VALUES ($1,$2)", [ans_element, question_id], function (err, result) {
                                                    done();
                                                    if (err) {
                                                        console.log(err);
                                                        resp.send('FAIL insert answer option');
                                                    }
                                                });
                                            });
                                        }

                                    }
                                });
                            }

                        });
                    }
                });
                var obj = {
                    survey_name: survey_title,
                    status: 'success'
                }
                resp.send(obj);
            }

        });
    });
});

// update DB with modified survey
app.post("/modifySurvey", function (req, resp) {
    checkLogin(req,resp);
    var questions = req.body.questions;

    pool.connect(function (err, client, done) {
        if (err) {
            console.log(err);
            resp.send("FAIL");
        }
        // ** check if survey Exist in department **
        client.query("SELECT * FROM survey WHERE department_id = $1 and survey_name = $2 and been_published = false", [req.session.department, req.body.name], function (err, result) {
            done();
            var survey_id; // store survey ID
            if (err) {
                console.log(err);
                return false;
            }
            if (result.rows.length > 0) {
                // ---- Update survey's time stamp ----//
                client.query("UPDATE survey SET updated = now() WHERE id = $1 RETURNING id", [result.rows[0].id], function (err, result) {
                    done();
                    if (err) {
                        console.log(err);
                        resp.send("FAIL to update survey");
                    } else {
                        survey_id = result.rows[0].id;
                        // ---- Delete question ---- //
                        client.query("DELETE FROM question WHERE survey_id = $1", [survey_id], function (err, result) {
                            done();
                            if (err) {
                                console.log(err);
                                resp.send("FAIL to update survey WHEN deleting question");
                            }
                            // ---- Insert question ---- //
                            questions.forEach(function (Element) {
                                var question_id; // store question ID
                                // TODO rating Question;
                                for(var i=0; i<Element.answers[0].length;i++){
                                    if (Element.type == 'ratingQuest') {
                                        client.query("INSERT INTO question (question_type, question_text, survey_id, question_image,question_column) VALUES ($1,$2,$3,$4,$5) RETURNING id", [Element.type, Element.question, survey_id,Element.questionImage,Element.answers[0][i]], function (err, result) {
                                            done();
                                            if (err) {
                                                console.log(err);
                                                resp.send("FAIL insert question");
                                            } else {
                                                question_id = result.rows[0].id;
                                                // ---- Insert answer option data ---- //
                                                if (Element.answers != undefined) {
                                                    Element.answers[1].forEach(function (ans_element) {
                                                        client.query("INSERT INTO answer_option (answer_option_text,question_id) VALUES ($1,$2)", [ans_element, question_id], function (err, result) {
                                                            done();
                                                            if (err) {
                                                                console.log(err);
                                                                resp.send('FAIL insert answer option');
                                                            }
                                                        });
                                                    });
                                                }
                                            }
                                        });
                                    }else {
                                    client.query("INSERT INTO question (question_type, question_text, survey_id, question_image) VALUES ($1,$2,$3,$4) RETURNING id", [Element.type, Element.question, survey_id,Element.questionImage], function (err, result) {
                                        done();
                                        if (err) {
                                            console.log(err);
                                            resp.send("FAIL insert question");
                                        } else {
                                            question_id = result.rows[0].id;
                                            // ---- Insert answer option data ---- //
                                            if (Element.answers != undefined) {
                                                Element.answers.forEach(function (ans_element) {
                                                    client.query("INSERT INTO answer_option (answer_option_text,question_id) VALUES ($1,$2)", [ans_element, question_id], function (err, result) {
                                                        done();
                                                        if (err) {
                                                            console.log(err);
                                                            resp.send('FAIL insert answer option');
                                                        }
                                                    });
                                                });
                                            }
                                        }
                                    });
                                }
                                
                                } 
                            });
                        });

                    }
                    var obj = {
                        survey_name: req.body.name,
                        status: 'success'
                    }
                    resp.send(obj);
                });
            } else {
                resp.send("No survey in your department");
            }
        });
    });
});

// get view from DB
app.post("/viewSurvey",function(req,resp){
    checkLogin(req,resp);
    var resp_obj = {}
    pool.connect(function(err,client,done){
       if(err){
           console.log(err);
           resp.end('FAIL');
       }else{
           client.query("SELECT *,(SELECT COUNT(*) FROM answer WHERE answer.answer_id = answer_option.id) FROM question LEFT JOIN answer_option ON question.id = answer_option.question_id WHERE survey_id = (SELECT id FROM survey WHERE id = $1 and department_id = $2)",[req.body.survey_id,req.session.department],function(err,result){
               done();
               console.log(result.rows.length);
               if(result.rows.length>0){
                   for(var i=0; i<result.rows.length;i++){
                       var question_text = result.rows[i].question_text;
                       if(typeof resp_obj[question_text] == 'undefined'){
                           resp_obj[question_text] = [];
                       }
                       var answer_option_text = result.rows[i].answer_option_txt;
                       var answer_count = parseInt(result.rows[i].count);
                        var tmp_array = []
                        tmp_array.push(answer_option_text);
                        tmp_array.push(answer_count);
                       resp_obj[question_text].push(tmp_array);
                   }
                   resp.send(resp_obj);
               }else{
                   resp.send("no result");
               }
           });
       }
    });
})

app.post("/getSurveyData",function(req,resp){
   checkLogin(req,resp);
    pool.connect(function(err,client,done){
       if(err){
           console.log(err);
           resp.end('FAIL');
       }else{
           client.query("select (select question_text from question where question.id = answer.question_id), (select answer_option_text from answer_option where answer.answer_id = answer_option.id) from answer WHERE survey_id = (SELECT id FROM survey WHERE id = $1 and department_id = $2)",[req.body.survey_id,req.session.department],function(err,result){
               done();
               if(err){
                   console.log(err);
                   resp.end("FAIL");
               }
               if(result.rows.length>0){
                   resp.send(result.rows);
               }else{
                   resp.send("no result");
               }
           })
       }
    });
});
// handle admin panel button actions
var req_survey_id;
app.post("/adminPanel", function (req, resp) {
    checkLogin(req,resp);
    // *** CREATE ***//
    if (req.body.type == "create") {
        resp.sendFile(pF + "/halfEditor.html");
    }

    // *** VIEW *** //
    if (req.body.type == 'view') {
        pool.connect(function (err, client, done) {
            if (err) {
                console.log(err);
                resp.end("FAIL");
            }
            client.query("SELECT * FROM survey WHERE department_id = $1", [req.session.department], function (err, result) {
                done();
                if (err) {
                    console.log(err);
                    resp.end("FAIL");
                }
                if (result.rows.length > 0) {
                    resp.send(result.rows);
                } else {
                    resp.send({
                        message: "No survey in your deparment",
                        status: "No survey"
                    });
                }
            });
        });
    }
    
    // *** VIEW STATUS *** //
    if(req.body.type == 'view_status'){
        pool.connect(function(err,client,done){
            if(err){
                console.log(err);
                resp.end('FAIL');
            }
            client.query("SELECT survey.*,(SELECT COUNT(*) FROM answer WHERE answer.survey_id = survey.id) AS count FROM survey WHERE department_id = $1",[req.session.department],function(err,result){
                if(result.rows.length>0){
                    resp.send(result.rows);
                }else{
                    var obj = {
                        survey_result: "no result"
                    }
                    resp.send(obj)
                }
            });
        });
    }
    
    // *** PUBLISH ***//
    if(req.body.type == 'publish'){
        pool.connect(function(err,client,done){
            if(err){
                console.log(err);
                resp.end('FAIL');
            }
            client.query("UPDATE survey SET been_published=true WHERE id = $1 and department_id= $2 and been_published = false",[req.body.survey_id, req.session.department],function(err,result){
                done();
                if(err){
                    console.log(err);
                    resp.end('Fail');
                }
                console.log(result.rowCount);
                if(result.rowCount == 0){
                    console.log("hahha");
                    resp.send({
                        status: false,
                        msg:"survey cannot publish twice"
                    })
                }else if(result.rowCount > 0){
                    client.query("UPDATE survey SET isopen=false WHERE department_id = $1 ",[req.session.department],function(err,result){
                       done();
                        if(err){
                            console.log(err);
                            resp.end('Fail');
                        }
                        client.query("UPDATE survey SET isopen=true, been_published = true WHERE id = $1 and department_id = $2 RETURNING survey_name",[req.body.survey_id,req.session.department],function(err,result){
                            done();
                            if(err){
                                console.log(err);
                                resp.end('FAIL');
                            }else{
                                resp.send(result.rows[0]);
                            }
                        })
                    });
               }
            });
            
        })
    }
    
    // *** MODIFY *** //
    if (req.body.type == 'modify') {
        getSurveyFromDB(req,resp);
    }
    
    // *** DELETE *** //
    if(req.body.type == 'delete'){
        pool.connect(function(err,client,done){
            if(err){
                console.log(err)
                resp.end("FAIL")
            }
            client.query("DELETE FROM survey WHERE id = $1 and department_id = $2 and isopen = false RETURNING survey_name",[req.body.survey_id,req.session.department],function(err,result){
                done();
                if(err){
                    console.log(err);
                    resp.end('FAIL');
                }else{
                    console.log(result.rows);
                    if(result.rows.length > 0){
                        resp.send({
                            status:"success",
                            survey_name:result.rows[0].survey_name
                        })
                    }else{
                        resp.send({
                            status:"FAIL"
                        })
                    }
                    
                }
            })
        });
    }
});



// server listen
server.listen(port, function (err) {
    if (err) {
        console.log(err);
        return false;
    }

    console.log(port + " is running");
});
