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
console.time('full');
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
        let jobsMySQL = new model.Jobs();
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
                return jobsMySQL.orderBy('siteid', 'asc').fetchAll().then(function(jobsMySQL) {
                    let jobRecordNumber = jobsMySQL.length;
                    let jobRecordsJSON;
                    if (jobRecordNumber) {
                        jobRecordsJSON = jobsMySQL.toJSON();
                        console.log('Number of already inserted records - ' + jobRecordNumber);
                    }
                    else {
                        jobRecordNumber=0;
                        console.log('NO JOBS INSERTED!');
                    }
                    let currentDateTime = new Date();
                    let siteRecord;
                    let insertJob = [];
                    let updateJob = [];
                    let deleteJob = [];
                    let jobRecord;
                    console.time('label')
                    while (i < recordNumber) {
                        console.time('label '+ i);
                        siteRecord = recordsJSON[i];
                        // console.log('=====================================');
                        let autoGFPriority = recordsJSON[i].autogf_priority;
                        // console.log("Modified current datetime " + currentDateTime.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, ''));
                        // console.log('Site id ' + siteMySQL.toJSON()[i].siteid);
                        // console.log('Datetime ' + currentDateTime);
                        // console.log('Datetime ISO ' + currentDateTime.toISOString());
                        // console.log('Timestamp ' + currentDateTime.getTime());
                        // console.log('Autogf lastrun ' + siteMySQL.toJSON()[i].autogf_lastrun.getTime());
                        // console.log('Autogf lastrun datetime ' + siteMySQL.toJSON()[i].autogf_lastrun);
                        let timeDiff = dateHandle.dateDiffInDaysCeil(siteRecord.autogf_lastrun, currentDateTime);
                        // console.log('TIME DIFFERENCE ' + timeDiff);
                        if (timeDiff >= autoGFPriority) {
                            console.log("Site with siteid " + siteRecord.siteid + " is eligible for auto GF");
                            jobRecord =
                                {
                                    siteid: siteRecord.siteid,
                                    siteurl: siteRecord.siteurl,
                                    bbstype: siteRecord.bbstype,
                                    cgipath: siteRecord.cgipath,
                                    needlogin: siteRecord.needlogin,
                                    agentname: siteRecord.agentname,
                                    fetchdelay: siteRecord.fetchdelay,
                                    timeoutvalue: "120",
                                    useproxy: "1",
                                    dateadded: siteRecord.dateadded,
                                    dateupdated: siteRecord.dateupdated,
                                    lastcrawl: siteRecord.lastcrawl,
                                    lastrun: siteRecord.autogf_lastrun,
                                    lastsync: siteRecord.autogf_latsync,
                                    priority: siteRecord.autogf_priority
                                };
                            let j=0;
                            let jobFound = false;
                            while (j < jobRecordNumber) {
                                if (siteRecord.siteid === jobRecordsJSON[j].siteid) {
                                    jobRecord['id'] = jobRecordsJSON[j].id;
                                    updateJob.push(jobRecord);
                                    jobFound = true;
                                    break;
                                }
                                j++;
                            }
                            if(!jobFound) insertJob.push(jobRecord);
                        }                        
                        console.timeEnd('label '+ i);
                        i++;
                    }
                    let siteFound = false;
                    for(i=0; i < jobRecordNumber; i++) {
                        for(j=0; j < recordsJSON.length; j++) {
                            if(jobRecordsJSON[i].siteid === recordsJSON[j].siteid)  {
                                siteFound = true;
                                break;
                            }
                        }
                        if (!siteFound) {
                            deleteModel.push(jobRecordsJSON[i].id);
                        }
                        siteFound = false;
                    }
                    console.timeEnd('label');
                    console.log('Insert job ' + JSON.stringify(insertJob));
                    console.log('Update job ' + JSON.stringify(updateJob));
                    console.log('Delete job ' + JSON.stringify(deleteJob));
                    return Promise.all([insertJob, updateJob, deleteModel]);
                }).then (function(models){
                    return models;
                });
            }).then (function(models){
                let insertJobCollection = model.JobsCollection.forge(models[0]);
                let queueRecord;
                let insertQueue = [];
                let updateJob = models[1];
                let deleteJob = models[2];
                return insertJobCollection.invokeThen('save', null, {method: 'insert'}).then(function(operationStatus) {
                    console.log('Records inserted to jobs - ' + operationStatus.length);
                    if (operationStatus.length > 0) {
                        operationStatus.forEach(function(element, i) {
                            console.log('Siteid - ' + element.get('siteid'));
                            queueRecord = {
                                job_id: element.get('id'),
                                priority: "15"
                            };
                            insertQueue.push(queueRecord);
                        }, this);
                    }                   
                    return Promise.all([insertQueue, updateJob, deleteJob]);
                });
            }).then(function(models) {
                let insertQueue = models[0];
                let updateJob = models[1];
                let deleteJob = models[2];
                let insertQueueCollection = model.QueueCollection.forge(insertQueue);
                //console.log('Queue Job ID ' + insertQueue[0].job_id);
                console.log('Insert to queue ' + JSON.stringify(insertQueue));
                return insertQueueCollection.invokeThen('save', null, {method: 'insert'}).then(function(operationStatus) {
                    console.log('Queue records inserted - ' + operationStatus.length);
                    operationStatus.forEach(function(element, i) {
                        console.log(`Queue id - ${element.id}`);
                    }, this);
                    console.log('Added to queue! ');
                    return models;
                });
            }).then(function(models) {
                let updateJobCollection = model.JobsCollection.forge(models[1]);
                let deleteJob = models[2];
                console.log('Another that is lower update job ' + JSON.stringify(models[1]));
                return updateJobCollection.invokeThen('save', null, {method: 'update'}).then(function(operationStatus) {
                    console.log('Job records updated - ' + operationStatus.length);
                    operationStatus.forEach(function(element, i) {
                        console.log(`Job id - ${element.id}`);
                    }, this);
                    console.log('Job data is updated!');
                    return Promise.all([operationStatus, deleteJob]);
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
        console.timeEnd('full');
        return model.closeMSSQLConnection(), model.closeMySQLConnection();
        // process.exit();
    });
}