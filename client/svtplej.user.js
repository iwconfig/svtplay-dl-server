// ==UserScript==
// @name         svtplej
// @namespace    https://github.com/iwconfig/svtplay-dl-server
// @version      1.3.1
// @description  adds a button to imdb search and a button to download the video, connecting to a download server which is through websocket which is running svtplay-dl, and shows the process in a progress bar and command output
// @author       iwconfig
// @match        http://www.svtplay.se/*
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @run-at       document-idle
// @resource     imdb_img http://i.imgur.com/Ht8jxfu.png
// @resource     dl_img http://i.imgur.com/rFwkUrn.png
// @resource     progress http://i.imgur.com/9UjqJVg.gif
// @resource     finished http://i.imgur.com/VKsFPh5.png
// ==/UserScript==

// Tested in chrome with Tampermonkey.

// Bare with me.
// i'm not particularly good at javascript and this is quite messy, but it gets the job done.
// Check out my github if you want to contribute! :)

// Before you begin, point the 'ws_url' variable to the one you have set up in svtplay-dl-server.
// Default is a secure connection to localhost on port 5000 which should be alright if the server is run locally.

// Also change the variables in the beginning of run() to whatever suits you.
// Further down you can also edit the format conditionally when dealing with season and episode for example.

// Some stuff, like categories and genres for example, is in Swedish by default,
// I assume most of you who are using this are speaking swedish but if not or if you prefer another language
// then submit an issue about this and i'll fix english translations for you.
// Ultimately this script is only temporary as i plan to make it a standalone extension,
// which would make translations among other things a piece of cake. So for now I keep it simple.


window.addEventListener ("load", LocalMain, false);

function LocalMain () {
    'use strict';
    var ws_url = 'wss://localhost:5000'; // Websocket URL

    var imdb = document.createElement('img');
    imdb.src = GM_getResourceURL('imdb_img');
    imdb.setAttribute('style', 'padding-left:5px; vertical-align:middle', 'src', imdb.src);

    var dl_img = document.createElement('img');
    dl_img.src = GM_getResourceURL('dl_img');
    dl_img.setAttribute('style', 'padding-left:5px; vertical-align:middle', 'src', dl_img.src);

    var progress_img = document.createElement('img');
    progress_img.id = 'progress_img';
    progress_img.src = GM_getResourceURL('progress');
    progress_img.setAttribute('style', 'padding-left:5px; vertical-align:middle; width: 50px; height 50px');

    var finished_img = document.createElement('img');
    finished_img.src = GM_getResourceURL('finished');
    finished_img.setAttribute('style', 'padding-left:5px; vertical-align:middle; width: 48px; height px');
    finished_img.id = 'finished';

    function run(){
        //var title = document.querySelector('.play_video-page__title-element--top').querySelector('span').textContent.replace(/, avsnitt \d+/g, '');
        //var info = document.querySelector('.play_video-page__title-element--sub').textContent;

        ////// Variables for svtplay-dl
        var programTitle = __svtplay.videoTitlePage.titlePage.programTitle;
        var title = __svtplay.videoTitlePage.video.programTitle; // optional: add .replace(': ', ' - ')
        var info = __svtplay.videoTitlePage.video.title;
        var season = null;
        var episode = null;
        var format = '{t}';
        var cmd_options = '-M -f --force-subtitle';
        var tmpdir = '/tmp/svtplay_downloads/';
        var path = '/media/SVT';

        path = path.replace(/\/+$|$/, "/");
        var genres = [ 'Drama', 'Humor', 'Livsstil', 'Underhållning', 'Kultur', 'Samhälle & fakta', 'Nyheter', 'Sport', 'Barn', 'Komedi' ];
        var clusters = JSON.parse(JSON.stringify(__svtplay.videoTitlePage.video.clusters));
        var access_service = __svtplay.videoTitlePage.video.accessService;
        if (__svtplay.videoTitlePage.video.episodic) {
            path += 'TV-serier/';
        } else {
            if (__svtplay.videoTitlePage.video.titleType === "CLIP") {
                path += 'Videoklipp/';
            } else {
                var category = ['Dokumentär', 'Film', 'Kortfilm'];
                for (var i = 0; i < clusters.length; i++) {
                    if (category.includes(clusters[i].name)) {
                        console.log(category[category.indexOf(clusters[i].name)]);
                        path += category[category.indexOf(clusters[i].name)] + 'er/';
                        break;
                    }
                }
            }
        }
        if (access_service === 'signInterpretation') {
            path += 'Teckenspråkstolkat/';
        }
        if (access_service === 'audioDescription') {
            path += 'Syntolkat/';
        }
        if (window.location.href.indexOf('/video/') === -1 && window.location.href.indexOf('/klipp/') === -1) {
            cmd_options += ' -A';
            if (__svtplay.videoTitlePage.video.episodic) {
                season = __svtplay.videoTitlePage.video.season;
                format += '/Säsong {s}';
            }
            info = null;
        } else {
            if (__svtplay.videoTitlePage.video.titleType === "CLIP") {
                path += programTitle + '/';
                title = info;
            } else {
                for (var i = 0; i < clusters.length; i++) {
                    if (genres.includes(clusters[i].name)) {
                        path += clusters[i].name + '/';
                        console.log(path);
                        break;
                    }
                }
                if (title === info) {
                    info = null;
                }
                if (title.indexOf(programTitle) === -1) {
                    title = programTitle + ': ' + title;
                }
                if (__svtplay.videoTitlePage.video.episodic) {
                    season = __svtplay.videoTitlePage.video.season;
                    episode = __svtplay.videoTitlePage.video.episodeNumber;
                    if (info.indexOf('Avsnitt') !== -1 && info.indexOf(':') === -1) {
                        format += ' [s{s}e{ee}]';
                    } else {
                        format += ' - ';
                        if (info) {
                            format += '{i}';
                        }
                        format += ' [s{s}e{ee}]';
                    }
                } else {
                    if (info) {
                        if (/idag|igår|mån|tis|ons|tor|fre|lör|sön/g.test(info.toLowerCase())) {
                            format += ' [{i}]';
                        } else {
                            format += ' - {i}';
                        }
                    }
                }
            }
        }
        ////// End of configuration

        var span = document.createElement('span');
        span.setAttribute('class', 'play_video-page__title-element userscript');
        var span2 = document.createElement('span');
        span2.setAttribute('class', 'userscript');
        span2.innerHTML = '<br/>';

        if (__svtplay.videoTitlePage.video.titleType !== "CLIP") {
            var imdblink = document.createElement('a');
            imdblink.setAttribute('href', 'http://www.imdb.com/find?s=tt&q=' + __svtplay.videoTitlePage.video.programTitle.replace(/ /g, '+'));
            imdblink.appendChild(imdb);
            span.appendChild(imdblink);
        }

        var finished_link = document.createElement('a');
        finished_link.setAttribute('id', 'finished');
        finished_link.appendChild(finished_img);

        var dl_link = document.createElement('a');
        dl_link.setAttribute('id', 'download');
        dl_link.href = '';
        dl_link.setAttribute('onclick', 'return false;');
        dl_link.appendChild(dl_img);
        dl_link.addEventListener ("click", function () {

            if (document.getElementById('cancel')) {
                if (document.getElementById('progress')) {
                    if (document.getElementById('finish') === null) {
                        if (! document.getElementById('note')) {
                            var notice = document.createElement('strong');
                            notice.id = 'note';
                            notice.style='color: white; position:absolute';
                            notice.innerHTML = 'Please cancel first.';
                            span.appendChild(notice);
                            window.setTimeout(function() {
                                if (notice !== null) {
                                    span.removeChild(notice);
                                }
                            }, 5000);
                        }
                        return;
                    }
                }
            }

            var ws = new WebSocket(ws_url);
            if (!document.querySelector('#progress_img')) {
                dl_link.removeChild(dl_img);
                dl_link.appendChild(progress_img);
            } else {
                return;
            }
            if (document.getElementById('output')) {
                span2.innerHTML = '<br/>';
                span.removeChild(document.getElementById('progresslabel'));
                if (document.getElementById('finished')) {
                    span.removeChild(document.getElementById('finished'));
                }
            }

            var output = document.createElement('div');
            output.id = 'output';
            output.style = 'margin: 0 auto; display: inline-block; position: relative; padding: 5px; border-radius: 5px; color: black; background-color: #dee5bc; font-family: "Monospace"; text-align: left';

            var progress = document.createElement('progress');
            progress.id = 'progress';
            GM_addStyle('progress { margin: 0 auto; margin-top: 5px; background-color: #2e3233; border: 1px; border-radius: 10px; padding: 5px; width: 500px; height: 20px;} progress::-webkit-progress-bar { background-color: transparent; } progress::-webkit-progress-value { background-color: #00c800; border-radius: 10px; } #progresslabel { position: absolute; margin-left: 10px; margin-top: 25px; font-family: "Arial"; font-size: medium; font-weight: bold; color: white; }');

            var progresslabel = document.createElement('span');
            progresslabel.id = 'progresslabel';
            progresslabel.innerHTML = 'Connecting...';
            span2.appendChild(progress);
            span.appendChild(progresslabel);
            span2.insertAdjacentHTML('beforeend', '<br/>');

            var ShowHideOutput = document.createElement('label');
            ShowHideOutput.innerHTML = 'Hide output';
            ShowHideOutput.id = 'showhide';
            ShowHideOutput.href = '';
            ShowHideOutput.style = 'position: relative;  display: inline-block; color: #dee5bc;';
            ShowHideOutput.setAttribute('onclick', 'return false;');
            ShowHideOutput.addEventListener('click', function() {
                if (output.style.display === 'none') {
                    output.style.display = 'inline-block';
                    ShowHideOutput.innerHTML = 'Hide output';
                } else {
                    output.style.display = 'none';
                    ShowHideOutput.innerHTML = 'Show output';
                }

            });

            ws.onerror = function(error) {
                dl_link.removeChild(progress_img);
                dl_link.appendChild(dl_img);
                dl_link.addEventListener("click", function (e) {
                    e.stopImmediatePropagation();
                    if (document.querySelector('.userscript')) {
                        Array.prototype.forEach.call(document.querySelectorAll('.userscript'), function( node ) {
                            node.parentNode.removeChild( node );
                        });
                        ws.close();
                        run();
                    }
                });

                progresslabel.innerHTML = 'Is the websocket server running?';

            };

            ws.onopen = function(url) {
                var articleId = __svtplay.videoTitlePage.video.articleId.toString();
                progresslabel.innerHTML = 'Connected';
                var jsondata = {'url'  : document.URL,
                                'path' : path,
                                'title': title,
                                'info' : info,
                                'season': season,
                                'episode': episode,
                                'format': format,
                                'cmd_options': cmd_options,
                                'tmpdir': tmpdir,
                                'articleId': articleId };
                ws.send(JSON.stringify(jsondata));

                var cancel = document.createElement('label');
                cancel.id = 'cancel';
                cancel.innerHTML = 'CANCEL';
                cancel.style = 'color: #dee5bc; position: relative;';
                cancel.setAttribute('onclick', 'return false;');
                cancel.addEventListener ("click", function () {
                    ws.close();
                    output.insertAdjacentHTML('beforeend', '<i style="color: red">Cancelled</i>');
                    span2.removeChild(document.getElementById('cancel'));
                    span2.removeChild(document.getElementById('delimiter'));
                    dl_link.removeChild(progress_img);
                    dl_link.appendChild(dl_img);

                });
                span2.appendChild(ShowHideOutput);
                span2.insertAdjacentHTML('beforeend', '<span id="delimiter" style="color: #dee5bc"> | </span>');
                span2.appendChild(cancel);
                span2.insertAdjacentHTML('beforeend', '<br/>');
                span2.appendChild(output);

            };

            ws.onmessage = function(event) {
                var json = JSON.parse(event.data);
                console.log(Object.keys(json) + ': ' + Object.values(json));

                if (json.progress) {
                    progress.value = json.progress[0];
                    progress.max = json.progress[1];
                    progresslabel.innerHTML = Math.floor((progress.value / progress.max) * 100) + '%';
                } else {
                    var line = document.createElement('p');
                    output.appendChild(line);
                    if (json.INFO) {
                        line.style = 'color: green';
                        line.className = 'info';
                    }
                    if (json.ERROR) {
                        line.style = 'color: red';
                        line.className = 'error';
                    }
                    if (json.message) {
                        line.style = 'color: yellow';
                        line.className = 'message';
                    }
                    if (json.status === 'CONNECTED') {
                        console.log(json.status);
                    } else {
                        if (json.finish) {
                            line.style = 'color: green';
                            line.id = 'finish';
                            line.innerHTML = 'The download is finished';
                            span2.removeChild(document.getElementById('cancel'));
                            span2.removeChild(document.getElementById('delimiter'));
                            dl_link.removeChild(progress_img);
                            dl_link.appendChild(dl_img);
                            finished_link.href = 'file://///' + path.replace(/\/+$|$/, '/'); //+ output.lastChild.previousSibling.innerText.split(/'/)[1];
                            dl_link.insertAdjacentHTML('afterend', finished_link.outerHTML);

                        } else {
                            for (var i in json) {
                                line.innerHTML = json[i].replace(/INFO: /g, '<br/>');
                            }
                        }
                    }
                }
            };
        }, false);

        span.appendChild(dl_link);
        document.getElementsByClassName("play_video-page__title")[0].appendChild(span);
        document.getElementsByClassName("play_video-page__title")[0].appendChild(span2);
    }

    if (document.querySelector('.play_video-page__title')) {
        run();
    }

    var target = document.querySelector('title');
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (document.querySelector('.userscript')) {
                Array.prototype.forEach.call(document.querySelectorAll('.userscript'), function( node ) {
                    node.parentNode.removeChild( node );
                });
            }
            location.reload();
            document.addEventListener("DOMContentLoaded", function(event) {
                run();
            });
        });
    });
    var config = { attributes: true, childList: true, characterData: true, characterDataOldValue: true };
    observer.observe(target, config);
}