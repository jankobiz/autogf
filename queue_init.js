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
                let i = utilFunctions.getRandomIntInclusive(0,27325);
                console.log('Random number ' + i);
                let currentDateTime = new Date();
                console.log(currentDateTime.toString().replace(/\s(GMT)\+\d{4}\s+\(.+\)$/, ''));
                console.log('Time Zone Offset ' + currentDateTime.getTimezoneOffset());
                console.log('Time Milliseconds ' + currentDateTime.getMilliseconds());
                console.log('Datetime ' + currentDateTime);
                console.log('Datetime ISO ' + currentDateTime.toISOString());
                console.log('Timestamp ' + currentDateTime.getTime());
                console.log('Autogf lastrun ' + siteMySQL.toJSON()[i].autogf_lastrun.getTime());
                console.log('Autogf lastrun UTC ' + siteMySQL.toJSON()[0].autogf_lastrun.getUTC);
                console.log('Autogf lastrun datetime ' + siteMySQL.toJSON()[0].autogf_lastrun);
                let timeDiff = currentDateTime.getTime() - siteMySQL.toJSON()[0].autogf_lastrun.getTime();
                console.log('TIME DIFFERENCE ' + timeDiff);
                console.log('TIME DIFFERENCE IN DAYS ' + timeDiff/(1000 * 60 * 60 * 24));
                console.log('TIME DIFFERENCE IN DAYS FUNCTION FLOOR ' + dateHandle.dateDiffInDaysFloor(siteMySQL.toJSON()[0].autogf_lastrun, currentDateTime));
                console.log('TIME DIFFERENCE IN DAYS FUNCTION CEIL ' + dateHandle.dateDiffInDaysCeil(siteMySQL.toJSON()[0].autogf_lastrun, currentDateTime));
                console.log('Function time diff ' + dateHandle.dateDiffInDaysUTC(siteMySQL.toJSON()[0].autogf_lastrun, currentDateTime));
                console.log(siteMySQL.toJSON()[i]);
                return siteMySQL.toJSON()[i];
            }).then (function(record){
                return  job.save({siteid: record.siteid, siteurl: record.siteurl, bbstype: record.bbstype,
                     cgipath: record.cgipath, needlogin: record.needlogin, agentname: record.agentname,
                     fetchdelay: record.fetchdelay, timeoutvalue: "120", useproxy: "1"}).then(function(operationStatus) {
                   console.log('Added to jobs! ');
                   console.log(operationStatus.toJSON());
                   return operationStatus;
            }).then(function(operationStatus) {
                return  qu.save({priority: "15", job_id: operationStatus.toJSON().id}).then(function() {
                    console.log('Added to queue!');
                });
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
    //    model.closeMSSQLConnection();
        process.exit();
    });
}