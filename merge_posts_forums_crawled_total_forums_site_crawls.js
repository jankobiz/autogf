fs = require('fs');
var Regex = require("regex");
var promises = require('promise');
var Promise = require('bluebird');

var timeout = 0;

var regex = new Regex(/(a|b)*abb/);

//var readFile = Promise.promisify(require("fs").readFile);
var  fsp = Promise.promisifyAll(require("fs"));
//var stream = fs.createWriteStream("final_output.txt");
//stream.write("Siteid\t\t\t\t\t\tforums crawled\t\t\t\t\t\tposts\r\n");
var fullFileString = "siteid,\tposts,\tforums_crawled,\ttotal_forums,\ttotal_crawls\r\n";

console.time('label');

fsp.readFileAsync("./output/final_output_total_forums_sorted.txt").then(function(contents) {
    //console.log('File content - ' + contents);
    console.log('Type of contents ' + typeof(contents));
    var result = contents.toString('utf8');
    var outputRequestsSplits = result.split(/\r\n|\r|\n/);
    fsp.readFileAsync("./data/sorted/number_of_crawls_per_site_sorted.csv").then(function(contents1) {
        var result1 = contents1.toString('utf8');
        var totalForumsPerSiteSplits = result1.split(/\r\n|\r|\n/);        
        var iterator = 0;        
        var siteidOutput = '';
        var siteidTotalCrawls = '';
        var totalSiteCrawls = 0;        
        var siteidMatched = false;
        var contint = 0;
        for(var j=1; j < outputRequestsSplits.length; j++) {
            console.time('label ' + j);
            siteidMatched = false;
            iterator++;
            siteidOutput = String(outputRequestsSplits[j].match(/^[a-zA-Z0-9]+/i));
            for(var x=1; x < totalForumsPerSiteSplits.length;  x++) {
                siteidTotalCrawls = String(totalForumsPerSiteSplits[x].match(/^[a-zA-Z0-9]+/i));                
                if (siteidOutput === siteidTotalCrawls) {
                    //console.log('Crawls ' + siteidTotalCrawls);
                    totalSiteCrawls = String(totalForumsPerSiteSplits[x].match(/[0-9]+$/i));
                    (function (ors, tfn) {
                        fullFileString += `${ors},\t${tfn}\r\n`;
                    })(outputRequestsSplits[j], totalSiteCrawls);
                    siteidMatched = true;
                    break;
                 }
            }
            if (siteidMatched !== true) {
                (function (ors) {
                    fullFileString += `${ors},\tnull\r\n`;
                })(outputRequestsSplits[j]);
            }
            else {
                contint++;
                if ((j % 100) === 0) {
                    console.timeEnd('label '+ j);
                    console.log('siteidMatched - ' + siteidMatched + '  ' + contint + ' Continued!  - Iterator ' + iterator);
                }
                //if (j === 1000) break;
                continue;
            }
            //console.log('FINAL ' + fullFileString);            
        }        
        return new Buffer (fullFileString);
    }).then(function(finalfilestring) {        
        fsp.writeFileAsync("./output/final_output_total_forums_total_crawls_sorted.txt", finalfilestring.toString('utf-8')).then(function() {
            console.log('Final Output written successfully!');
            console.timeEnd('label');
        }).catch(function(e) {
            console.error("Error writing file", e);
        });
    });
    return eval (contents);
}).then(function(results) {
    console.log('Second outer then completed!');
}).catch(SyntaxError, function(e) {
    console.log("File had syntax error", e);
//Catch any other error
}).catch(function(e) {
    console.error("Error reading file", e);
});