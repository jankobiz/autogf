var fs = require('fs');
var Regex = require("regex");
var http = require('http');
var Promise = require('bluebird');
//const util = require('util');

var model = require('./database/model/model.js');
var dateHandle = require('./util/date_handle.js');
var utilFunctions = require('./util/util.js');
var cronTaskNo = 1;
var testsiteMSSQL = new model.TestsitesMSSQL();
var testsiteMySQL = new model.TestsitesMySQL();
// var queue = new model.Queue();

// setInterval(function () {
    console.log('======================================================================================');
    console.log('Cron task number ' + cronTaskNo++);
    queue_init();
// }, 20000);

function queue_init() {
    //  fetch records from MS SQL DB
    let updateModel = [];
    let insertModel = [];    
    let deleteModel = [];
    testsiteMSSQL.orderBy('siteid', 'asc').fetchAll({columns: ['siteid', 'siteurl', 'bbstype', 'cgipath', 'needlogin', 'agentname', 'fetchdelay', 'timeoutvalue', 'useproxy', 'dateadded','dateupdated', 'lastcrawl', 'autogf_lastrun', 'autogf_lastsync', 'autogf_priority']}).then(function(siteMSSQL) {
        let resultsMSSQl = siteMSSQL.toJSON();
        console.log(resultsMSSQl.length + ' MS SQL testsites records fetched');
        //  fetch records from MySQL DB
        return testsiteMySQL.orderBy('siteid', 'asc').fetchAll().then(function(siteMySQL) {
            let resultsMySQL = siteMySQL.toJSON();
            console.log(resultsMySQL.length + ' MySQL testsites records fetched');
            let match = false;            
            let valMSSQL;
            let valMySQL;
            //  fetched records comparison
            resultsMSSQl.forEach(function(element, i) {
                match = false;                
                for(j=0; j<resultsMySQL.length; j++) {
                    if(element.siteid === resultsMySQL[j].siteid)  {
                        Object.keys(element).forEach(function(keyMSSQL) {
                            valMSSQL = element[keyMSSQL];
                            Object.keys(resultsMySQL[j]).forEach(function(keyMySQL) {
                                valMySQL = resultsMySQL[j][keyMySQL];
                                if(keyMSSQL === keyMySQL) {
                                    if(keyMSSQL === 'dateadded' || keyMSSQL === 'dateupdated' || keyMSSQL === 'lastcrawl' ||
                                       keyMSSQL === 'autogf_lastrun' || keyMSSQL === 'autogf_lastsync') {
                                        let valMSSQL1 = new Date(valMSSQL);
                                        let valMySQL1 = new Date(valMySQL);
                                        if (valMSSQL1.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, '') !== valMySQL1.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, '')) {
                                            if (updateModel.indexOf(element) === -1) {
                                                updateModel.push(element);
                                            }
                                            console.log('======================================');
                                            console.log('SITEID ' + element.siteid + ' ' + keyMSSQL);
                                            console.log('MS ISO STRING ' + valMSSQL1.toISOString());
                                            console.log('MS Original ' + valMSSQL1);
                                            console.log('MS Replaced ' + valMSSQL1.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, ''));
                                            console.log('My ISO STRING ' + valMySQL1.toISOString());
                                            console.log('My Original ' + valMySQL1);
                                            console.log('My Replaced ' + valMSSQL1.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, ''));
                                            console.log('======================================');
                                        }
                                    }
                                    else {
                                        if (valMSSQL !== valMySQL) {
                                            if (updateModel.indexOf(element) === -1) {
                                                updateModel.push(element);
                                            }
                                            console.log(element.siteid + ' keyMSSQL: ' + keyMSSQL + ' - valMSSQL: ' + valMSSQL);
                                            console.log(element.siteid + ' keyMySQL: ' + keyMySQL + ' - valMySQL: ' + valMySQL);
                                        }
                                    }                                
                                }
                            });
                        });
                        match = true;
                        break;
                    }
                }
                if (!match) {
                    insertModel.push(element);
                }
            }, this);
            let found = false;
            for(i=0; i < resultsMySQL.length; i++) {
                for(j=0; j < resultsMSSQl.length; j++) {
                    if(resultsMySQL[i].siteid === resultsMSSQl[j].siteid)  {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    deleteModel.push(resultsMySQL[i].siteid);
                }
                found = false;
            }
            console.log('Sites to delete ' + deleteModel);
            return Promise.all([updateModel, insertModel, deleteModel]);
        });
    }).then(function(models) {  // MySQL and MS SQL database sync;
        let updateTestsitesCollection = model.TestsitesCollection.forge(models[0]);
        let insertTestsitesCollection = model.TestsitesCollection.forge(models[1]);
        let deleteTestsiteMySQL = new model.TestsitesMySQL();
        let deleteModel = models[2];
        return updateTestsitesCollection.invokeThen('save', null, {method: 'update'}).then(function(success) {
                    console.log('Records updated - ' + success.length);
                    success.forEach(function(element, i) {
                        console.log('Siteid - ' + element.get('siteid'));
                    }, this);
                    return success;
               }).then(function(insertModel) {
                    return insertTestsitesCollection.invokeThen('save', null, {method: 'insert'}).then(function(success) {
                            console.log('Records inserted - ' + success.length);
                            success.forEach(function(element, i) {
                                console.log('Siteid - ' + element.get('siteid'));                                    
                            }, this);
                            return success;
                        });
               }).then(function(deleteModels) {
                   return deleteTestsiteMySQL.query().whereIn('siteid', deleteModel).del().then(function () {
                            console.log('Records deleted ' + deleteModel.length);
                            deleteModel.forEach(function(element, i) {
                                console.log('Siteid - ' + element);
                            }, this);
                            return deleteModel;
                        });
               });
    }).then(function(modus) {    // Queue initialization or Queue update
        var sitesMySQL = new model.TestsitesMySQL();
        let queueModelArray = [];
        let qu = model.Queue.forge();
        let jobModelArray = [];
        let job = model.Jobs.forge();
        console.log('Is Queue new');
        console.log(qu.isNew());
        return sitesMySQL.orderBy('siteid', 'asc').fetchAll().then(function(siteMySQL) {
            //console.log(JSON.stringify(siteMySQL));
                let n = utilFunctions.getRandomIntInclusive(0,27325);
                // console.log('Random number ' + i);
                let i = 0;
                let recordsJSON = siteMySQL.toJSON();
                let recordNumber = recordsJSON.length;
                console.log('Record number ' + recordNumber);
                let currentDateTime = new Date();
                let insertQueue = [];
                let insertJob = [];
                let jobRecord;
                while (i < 2) {
                    console.log('=====================================');
                    let autoGFPriority = recordsJSON[i].autogf_priority;                    
                    console.log("Modified current datetime " + currentDateTime.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, ''));
                    console.log('Site id ' + siteMySQL.toJSON()[i].siteid);
                    console.log('Datetime ' + currentDateTime);
                    console.log('Datetime ISO ' + currentDateTime.toISOString());
                    console.log('Timestamp ' + currentDateTime.getTime());
                    console.log('Autogf lastrun ' + siteMySQL.toJSON()[i].autogf_lastrun.getTime());                    
                    console.log('Autogf lastrun datetime ' + siteMySQL.toJSON()[i].autogf_lastrun);
                    let timeDiff = dateHandle.dateDiffInDaysCeil(siteMySQL.toJSON()[i].autogf_lastrun, currentDateTime);
                    console.log('TIME DIFFERENCE ' + timeDiff);
                    if (timeDiff >= autoGFPriority) {
                        console.log("Site with siteid " + siteMySQL.toJSON()[i].siteid + " is eligible for auto GF");
                        jobRecord = 
                            {
                                siteid: siteMySQL.toJSON()[i].siteid,
                                siteurl: siteMySQL.toJSON()[i].siteurl,
                                bbstype: siteMySQL.toJSON()[i].bbstype,
                                cgipath: siteMySQL.toJSON()[i].cgipath,
                                needlogin: siteMySQL.toJSON()[i].needlogin,
                                agentname: siteMySQL.toJSON()[i].agentname,
                                fetchdelay: siteMySQL.toJSON()[i].fetchdelay,
                                timeoutvalue: "120",
                                useproxy: "1",
                                dateadded: siteMySQL.toJSON()[i].dateadded,
                                dateupdated: siteMySQL.toJSON()[i].dateupdated,
                                lastcrawl: siteMySQL.toJSON()[i].lastcrawl,
                                lastrun: siteMySQL.toJSON()[i].autogf_lastrun,
                                lastsync: siteMySQL.toJSON()[i].autogf_latsync,
                                priority: siteMySQL.toJSON()[i].autogf_priority
                            };
                        insertJob.push(jobRecord);
                    }
                    //console.log(siteMySQL.toJSON()[i]);
                    i++;
                }
                // return insertJob;
                return Promise.all([insertJob]);
            }).then (function(models){
                let insertJobCollection = model.JobsCollection.forge(models[0]);
                return insertJobCollection.invokeThen('save', null, {method: 'insert'}).then(function(operationStatus) {
                    console.log('Records inserted - ' + operationStatus.length);
                    operationStatus.forEach(function(element, i) {
                        console.log('Siteid - ' + element.get('siteid'));
                    }, this);
                    console.log('Added to jobs! ');
                    // console.log (JSON.stringify(operationStatus));
                    // console.log(operationStatus.toJSON().id);
                    console.log('After stringify!');
                    //console.log(operationStatus.toJSON());
                    return operationStatus;
                });
            }).then(function(operationStatus) {
                let insertQueueCollection = model.QueueCollection.forge(operationStatus);
                let id = operationStatus[0].get('id');
                console.log('Operational ID ' + operationStatus[0].id);
                console.log('Operation status ' + JSON.stringify(operationStatus));
                return  qu.save({priority: "15", job_id: operationStatus[0].id}).then(function() {
                    console.log('Added to queue!');
                    return 'Success!';
                });
            });
        // return testsiteMySQL.orderBy('siteid', 'asc').fetchAll().then(function(siteMySQL) {
        //     let resultsMySQL = siteMySQL.toJSON();
        //     console.log(resultsMySQL.length + ' MySQL testsites records fetched');
            
        //     return queue.save().then(function () {
        //         console.log('Added into queue!');
        //     });
        //     // queue.set({siteid: resultsMySQL[0].siteid, siteurl: resultsMySQL[0].siteurl, bbstype: 'tipbbs', cgipath: 'cgipath',  needlogin: '0', agentname: 'BR'});
        //     // return model.Queue.forge({siteid: resultsMySQL[0].siteid}).save({siteurl: resultsMySQL[0].siteurl, bbstype: "tipbbs"}).save().then(function(model) {
        //     //     console.log('Queue ' + model);
        //     // });            
        // });
    }).catch(function(err) {
        console.error("Bookshelf problem " + err);
        console.error(err, err.stack);
    }).finally(function () {
        console.log('Finally finally block is executed!') ;
        return model.closeMSSQLConnection(), model.closeMySQLConnection();
        // process.exit();
    });
}