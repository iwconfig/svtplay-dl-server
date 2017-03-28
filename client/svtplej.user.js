// ==UserScript==
// @name         svtplej
// @namespace    https://github.com/iwconfig/svtplay-dl-server
// @version      2.0.1
// @description  adds a button to imdb search and a button to download the video, connecting to a download server which is through websocket which is running svtplay-dl, and shows the process in a progress bar and command output
// @author       iwconfig
// @updateURL    https://github.com/iwconfig/svtplay-dl-server/raw/master/client/svtplej.user.js
// @match        http*://www.svtplay.se/*
// @require      https://openuserjs.org/src/libs/sizzle/GM_config.min.js
// @grant        GM_addStyle
// @grant        GM_getResourceURL
// @grant        GM_getResourceText
// @run-at       document-start
// @resource     config_css https://gist.githubusercontent.com/iwconfig/1d054c941f1391fa0fdec61278857302/raw/8479840b272cf56cda60a9331e500a338f8758ce/svtplej.config.css
// @resource     imdb_img http://i.imgur.com/Ht8jxfu.png
// @resource     dl_img http://i.imgur.com/rFwkUrn.png
// @resource     progress http://i.imgur.com/9UjqJVg.gif
// @resource     finished http://i.imgur.com/VKsFPh5.png
// ==/UserScript==

/* global __svtplay:true */
/* global GM_getResourceURL */
/* global GM_getResourceText */
/* global GM_addStyle */
/* global GM_config */


/* Only tested in chrome with Tampermonkey but other managers *should* work just as well. */

/* Bare with me.
   i'm not particularly good at javascript and this is quite messy, but it gets the job done.
   Check out my github if you want to contribute! :)

   When you have installed the script and browsed to svtplay url you are prompted to set up your config.

   Also, in this script, change the variables in the beginning of run() to whatever suits you.
   Further down you can also edit the filename format conditionally, when dealing with season and episode for example.

   Some stuff, like categories and genres for example, is in Swedish by default.
   I assume most of you who are using this are speaking swedish but translations will be available
   as soon as i have the time for this. So for now I keep it simple. */

var css = GM_getResourceText('config_css');

function checkSettings() {

    var frame = document.createElement('div');
    document.body.appendChild(frame);
    var title = document.createElement('h1');
    title.className = 'config_header_title';
    title.innerHTML = `
svt<div class="teve">
<div id="antenn">
<svg height="60" width="40" viewBox="0 0 100 100"><polyline points="1.8125 21.4375 25.25 38.75 41.5 81.5 48 49 61 36 42 13.5 61 1" style="fill:none;stroke:rgba(101, 108, 121, 0.7);;stroke-width:4"></polyline></svg></div>
<div class="teve knappar" id="ONknapp"></div>
<div class="teve knappar" id="knapp1"></div>
<div class="teve knappar" id="knapp2"></div>
<div class="teve" id="stjaernkrig">plej</div>
</div> settings`;

    GM_config.init(
        {
            'id': 'svtplej',
            'title': title,
            'fields':
            {
                'ws_host':
                {
                    'section': 'Server',
                    'label': 'WebSocket host',
                    'type': 'text',
                    'default': 'localhost',
                    'labelPos': 'above',
                    'title': 'Set the HOST which points to your server. Default: localhost',
                },
                'ws_port':
                {
                    'label': 'WebSocket port',
                    'type': 'text',
                    'default': '5000',
                    'labelPos': 'above',
                    'title': 'Set which PORT the server is using. Default: 5000'
                },
                'path':
                {
                    'section': 'Path locations',
                    'label': 'Save path',
                    'type': 'text',
                    'labelPos': 'above',
                    'title': 'Specify where the server should put the downloaded videos.'
                },
                'tmpdir':
                {
                    'label': 'Temporary path',
                    'type': 'text',
                    'labelPos': 'above',
                    'title': 'Specify temporary directory. Type "default" for /tmp/svtplay_downloads',
                    'default': 'default'
                },
            },
            'frame': frame,
            'css': css,
            'events':
            {
                'open': function() {
                    frame.className += ' svtplej_center';
                    frame.style = '';
                    if (!window.localStorage.svtplej) {
                        var h3 = document.createElement('h3');
                        var span = document.createElement('h3');
                        h3.className = 'config_header_h3';
                        h3.innerHTML = 'First run!';
                        span.className = 'config_header_span';
                        span.innerHTML = 'Please set up your config below.';
                        span.style.fontSize = '20px';
                        frame.firstChild.firstChild.appendChild(h3);
                        frame.firstChild.firstChild.appendChild(span);
                    }
                    var divs = frame.getElementsByClassName('config_var');
                    var labels = frame.getElementsByTagName('label');
                    for (var i = 0; labels.length > i; i++) {
                        if (labels[i] !== divs[i].firstChild) {
                            divs[i].insertBefore(labels[i], divs[i].firstChild);
                        }
                        divs[i].setAttribute('data-tooltip', divs[i].title);
                        divs[i].removeAttribute('title');
                    }
                    //var secHeads = document.getElementsByClassName('section_header');
                    //secHeads[0].setAttribute('data-tooltip', 'Obligatory stuff');
                    //secHeads[1].setAttribute('data-tooltip', 'Obligatory stuff');
                    var resetBtn = document.getElementById('svtplej_resetLink');
                    resetBtn.setAttribute('data-tooltip', resetBtn.title);
                    resetBtn.removeAttribute('title');
                    document.getElementById('svtplej_resetLink').innerHTML = '⟲';
                    frame.appendChild(frame.firstChild.lastChild, frame);
                    frame.insertBefore(frame.firstChild.firstChild, frame.firstChild);

                },
                'save': function() {
                    GM_config.close();
                }
            }
        });
        if (!GM_config.get('ws_host') || !GM_config.get('ws_port') || !GM_config.get('path')) {
            GM_config.open();
            if (!window.localStorage.svtplej) {
                var btn = document.getElementById('svtplej_closeBtn');
                btn.disabled = true;
                btn.style.background = 'rgba(0, 0, 0, 0.30);';
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            } else {
                var storage = JSON.parse(window.localStorage.svtplej);
                for (var k in storage) {
                    if (storage[k] === '') {
                        document.getElementById('svtplej_field_'+k).style.background = 'rgba(255, 0, 0, 0.3)';
                    }
                }
                var span = document.createElement('h3');
                span.className = 'config_header_span';
                span.innerHTML = 'Something is missing. Look for fields marked in red or yellow.';
                span.style.fontSize = '20px';
                span.style.margin = '50px 0 -35px';
                frame.firstChild.firstChild.appendChild(span);
            }
        }
}

window.addEventListener ("DOMContentLoaded", LocalMain, false);

function LocalMain () {
    'use strict';
    checkSettings();
    var ws_url = 'wss://' + GM_config.get('ws_host') + ':' + GM_config.get('ws_port'); // Websocket URL

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

        /* Variables for svtplay-dl */
        var programTitle = __svtplay.videoTitlePage.titlePage.programTitle;
        var title = __svtplay.videoTitlePage.video.programTitle; // optional: add .replace(': ', ' - ')
        var info = __svtplay.videoTitlePage.video.title;
        var season = null;
        var episode = null;
        var format = '{t}';
        var cmd_options = '-M -f --force-subtitle';
        var tmpdir = GM_config.get('tmpdir'); // Default is '/tmp/svtplay_downloads/'
        var path = GM_config.get('path');

        if (path.substr(-1) !== '/') {
            path += '/';
        }

        var genres = [ 'Drama', 'Humor', 'Livsstil', 'Underhållning', 'Kultur', 'Samhälle & fakta', 'Nyheter', 'Sport', 'Barn', 'Komedi', 'Animerat' ];
        var clusters = [];
        var access_service = __svtplay.videoTitlePage.video.accessService;

        for (var i = 0; i < __svtplay.videoTitlePage.clusters.length; i++) {
            clusters.push(__svtplay.videoTitlePage.clusters[i].name);
        }

        if (__svtplay.videoTitlePage.video.titleType === "CLIP") {
            path += 'Klipp/';
        } else {
            if (__svtplay.videoTitlePage.video.episodic && !clusters.includes('Dokumentär')) {
                path += 'TV-serier/';
            } else {
                if (clusters.includes('Kortfilm')) {
                    path += 'Kortfilmer/';
                } else {
                    var category = ['Dokumentär', 'Film'];
                    for (i = 0; i < clusters.length; i++) {
                        if (category.includes(clusters[i])) {
                            console.log(category[category.indexOf(clusters[i])]);
                            path += category[category.indexOf(clusters[i])] + 'er/';
                            if (__svtplay.videoTitlePage.video.episodic && clusters[i] === 'Dokumentär') {
                                path += 'Dokumentärserier/';
                            }
                            break;
                        }
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
            info = null;
            if (__svtplay.videoTitlePage.video.episodic) {
                season = __svtplay.videoTitlePage.video.season;
                format += '/Season {s}';
            }
            for (i = 0; i < clusters.length; i++) {
                if (genres.includes(clusters[i])) {
                    path += clusters[i] + '/';
                    console.log(path);
                    break;
                }
            }
        } else {
            if (__svtplay.videoTitlePage.video.titleType === "CLIP") {
                path += programTitle + '/';
                title = info;
            } else {
                for (i = 0; i < clusters.length; i++) {
                    if (genres.includes(clusters[i])) {
                        path += clusters[i] + '/';
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
        /* End of configuration */

        var span = document.createElement('span');
        span.setAttribute('class', 'play_video-page__title-element userscript');
        var span2 = document.createElement('span');
        span2.setAttribute('class', 'userscript');
        span2.innerHTML = '<br/>';

        var configPopup = document.createElement('label');
        configPopup.id = 'open-config';
        configPopup.innerHTML = 'Config';
        configPopup.style = 'color: #dee5bc; position: relative; display: block;';
        configPopup.setAttribute('onclick', 'return false;');
        span2.appendChild(configPopup);
        configPopup.addEventListener('click', function() {
            GM_config.open();
        });

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
                progress.style.display = 'none';
                configPopup.style.display = 'block';
                dl_link.removeChild(progress_img);
                dl_link.appendChild(dl_img);
                dl_link.addEventListener("click", function (e) {
                    e.stopImmediatePropagation();
                    if (document.querySelector('.userscript')) {
                        Array.prototype.forEach.call(document.querySelectorAll('.userscript'), function( node ) {
                            node.parentNode.removeChild( node );
                        });
                        ws.close();
                        LocalMain();
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

                configPopup.style.display = 'none';
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
                    configPopup.style.display = 'block'; // fix me: this stops working after the first click.
                    //progress.style.display = 'none';
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
        span.insertAdjacentHTML('afterbegin', '<br/>');
        document.getElementsByClassName('play_video-page__title')[0].appendChild(span);
        document.getElementsByClassName('play_video-page__title')[0].appendChild(span2);
        if (window.location.href.indexOf('/video/') === -1 && window.location.href.indexOf('/klipp/') === -1) {
            span2.insertAdjacentHTML('beforeend', '<br/>');
        }
    }

    if (document.querySelector('.play_video-page__title')) {
        run();
    }

    var target = document.querySelector('title');
    var observer = new window.MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (document.querySelector('.userscript')) {
                Array.prototype.forEach.call(document.querySelectorAll('.userscript'), function( node ) {
                    node.parentNode.removeChild( node );
                });
            }
            var request = new XMLHttpRequest();
            request.onreadystatechange = (e) => {
                if (request.readyState !== 4) {
                    return;
                }
                if (request.status === 200) {
                    var janson = JSON.parse(/__svtplay'] = ({.*});/.exec(request.responseText)[1]);
                    __svtplay = janson;
                    run();
                } else {
                    console.warn('error: could not retrieve new JSON data (__svtplay)');
                }
            };
            request.open('GET', window.location.href);
            request.send();
        });
    });
    var config = { attributes: true, childList: true, characterData: true, characterDataOldValue: true };
    observer.observe(target, config);
}