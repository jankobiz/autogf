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
var fullFileString = "siteid,\tposts,\tforums_crawled\r\n";

console.time('label');

fsp.readFileAsync("./data/sorted/output_request_sorted.txt").then(function(contents) {
    //console.log('File content - ' + contents);    
    console.log('Type of contents ' + typeof(contents));
    var result = contents.toString('utf8');
    var outputRequestsSplits = result.split(/\r\n|\r|\n/);    
    fsp.readFileAsync("./data/sorted/number_of_crawled_forums_per_site_sorted.csv").then(function(contents1) {
        var result1 = contents1.toString('utf8');
        var crawledForumsPerSiteSplits = result1.split(/\r\n|\r|\n/);
        console.log('Length ' + outputRequestsSplits.length);
        var iterator = 0;
        var finalOutput = '';
        var siteidOutput = '';
        var siteidCrawled = '';
        var crawledForumNumber = 0;
        var outputPosts = 0;
        var siteidMatched = false;
        var contint = 0;
        for(var j=1; j < outputRequestsSplits.length; j++) {
            console.time('label ' + j);
            siteidMatched = false;
            iterator++;
            siteidOutput = String(outputRequestsSplits[j].match(/^[a-zA-Z0-9]+/i));
            outputPosts = String(outputRequestsSplits[j].match(/[0-9]+$/i));
            for(var x=1; x < crawledForumsPerSiteSplits.length;  x++) {
                siteidCrawled = String(crawledForumsPerSiteSplits[x].match(/^[a-zA-Z0-9]+/i));                
                crawledForumNumber = String(crawledForumsPerSiteSplits[x].match(/[0-9]+$/i));                 
                if (siteidOutput === siteidCrawled) {
                    (function (so, op, cfn) {
                        fullFileString += `${so},\t${op},\t${cfn}\r\n`;
                    })(siteidOutput, outputPosts, crawledForumNumber);
                     //(function (so, sc, op, cfn) {
                        //console.log(`${so}\t\t\t\t\t${sc}\t\t\t\t\t${op}\t\t\t\t\t${cfn}\r\n`);
                        //stream.write(`${so}\t\t\t\t\t${sc}\t\t\t\t\t${op}\t\t\t\t\t${cfn}\r\n`);
                     //})(siteidOutput, siteidCrawled, outputPosts, crawledForumNumber);
                     //console.log(`${siteidOutput}\t\t\t\t\t${siteidCrawled}\t\t\t\t\t${outputPosts}\t\t\t\t\t${crawledForumNumber}\r\n`);
                     //stream.write(`${siteidOutput}\t\t\t\t\t${siteidCrawled}\t\t\t\t\t${outputPosts}\t\t\t\t\t${crawledForumNumber}\r\n`);
                     //stream.write(`${siteidOutput}\t\t\t\t\t${outputPosts}\t\t\t\t\t${crawledForumNumber}\r\n`);
                     //stream.write(siteidOutput+'\t\t\t\t\t' + outputPosts + '\t\t\t\t\t' + crawledForumNumber + '\r\n');
                     siteidMatched = true;
                     break;
                 }
            }
            if (siteidMatched !== true) {
                (function (soj, opj) {                    
                    fullFileString += `${soj},\t${opj},\tnull\r\n`;
                })(siteidOutput, outputPosts);                
                //stream.write(`${siteidOutput}\t\t\t\t\t${outputPosts}\t\t\t\t\tnull\r\n`, function () {
                    //stream.end();
                //});
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
        //console.log('RESULT ' + finalfilestring);
        fsp.writeFileAsync("./output/final_output_sorted.txt", finalfilestring.toString('utf-8')).then(function() {
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