#!/usr/bin/env python3
class Unbuffered(object):
   def __init__(self, stream):
       self.stream = stream
   def write(self, data):
       self.stream.write(data)
       self.stream.flush()
   def __getattr__(self, attr):
       return getattr(self.stream, attr)
import sys
sys.stdout = Unbuffered(sys.stdout)
sys.stderr = Unbuffered(sys.stderr)
import os, re, asyncio, websockets, json, pexpect
from glob import glob
from shutil import move
from tempfile import gettempdir

__version__ = '1.0.1'

# Default 'host' points to localhost, LAN IP and/or WAN IP.
# 0.0.0.0 means listening on anything that has network access to this computer.
# Change 'host' to localhost or 127.0.0.1 if you want to strictly run it locally.
host = '0.0.0.0'
port = 5000

connected = set()

async def handler(websocket, path):
    ip = websocket.remote_address[0]
    if not websocket.remote_address[0] in connected:
        print("New client connected.")
        await websocket.send(json.dumps({'status': 'CONNECTED'}))
        connected.add(ip)
    try:
        while True:
            try:
                inbound = json.loads(await websocket.recv())
            except json.decoder.JSONDecodeError:
                print('ERROR: Inbound was not in JSON format.')
                return
            if inbound is None:
                return

            if 'url' not in inbound:
                print('ERROR: No url specified in JSON.')
                await websocket.send(json.dumps({'ERROR': 'No url specified in JSON.'}))
                return
            else:
                url = inbound['url']

            if 'path' in inbound:
                path = inbound['path'].rstrip(os.path.sep) + os.path.sep
            else:
                path = os.path.expanduser("~") + os.path.sep # use home directory if path is not set in json

            if 'title' in inbound:
                title = inbound['title']
                info = inbound['info']
                season = inbound['season']
                episode = inbound['episode']
                fmt = inbound['format']

                if 'format' in inbound:
                    opts = inbound['cmd_options']
                else:
                    opts = ''

                if 'tmpdir' in inbound:
                    tmpdir = inbound['tmpdir']
                else:
                    tmpdir = gettempdir() + os.sep + 'svtplay_downloads' + os.sep # use default tmp directory if tmpdir is not set in json

                try:
                    if not os.path.isdir(os.path.dirname(path)):
                        os.makedirs(path)
                except PermissionError:
                    print('ERROR: You dont have permission to create path: {}'.format(os.path.dirname(path)))
                    await websocket.send(json.dumps({'ERROR': 'You dont have permission to create path: {}'.format(os.path.dirname(path))}))
                if not os.path.isdir(tmpdir):
                    os.mkdir(tmpdir)
                os.chdir(tmpdir)

                for k in inbound:
                    print('{}: {}'.format(k,inbound[k]))
                filename = fmt.format(t=title, i=info if info else '', s=season if season else '', e=episode if episode else '', ee=format(int(episode), '02d') if episode else '')
                path += filename
            while inbound != None:
                cmd = 'svtplay-dl {options} -o "{output}" "{url}"'.format(options=opts, output=filename, url=url)
                child = pexpect.spawn(cmd)
                cpl = child.compile_pattern_list([pexpect.EOF, '\[(\d+)\/(\d+)\]|INFO: (.+)|ERROR: (.+)'])
                seg = 0
                error = False
                while True:
                    data = {}
                    p = child.expect_list(cpl, timeout=None)
                    await asyncio.sleep(.1)
                    if p == 0: # EOF
                        print('-'*60)
                        print("The sub process exited")
                        if error:
                            message = 'An error occured!'
                            print(message)
                            await websocket.send(json.dumps({'status': message}))
                            break

                        pattern = re.sub(r'\[', '[[]', tmpdir+filename)
                        pattern = re.sub(r'(?<!\[)\].*', '[]]', pattern)
                        for f in glob(pattern+'*'):
                            dest = os.path.join(os.path.dirname(path), os.path.basename(f))
                            if os.path.isfile(dest):
                                os.remove(dest)
                            move(f, os.path.dirname(path))
                            moved = "Moved '{}' into {}".format(os.path.basename(f), os.path.dirname(path))
                            print(moved)
                            await websocket.send(json.dumps({'INFO': moved}))
                            await websocket.send(json.dumps({'finish': True}))
                        print('-'*60)
                        break
                    if p == 1:
                        out = child.match.group(0).decode().rstrip()
                        if '[' in out[0]:
                            if child.match.group(1).decode().startswith('0'):
                                total = child.match.group(2).decode()
                            seg = child.match.group(1).decode()
                            data['progress'] = [seg, total]
                            sys.__stdout__.write('PROGRESS: {}/{}{}'.format(seg, total, '\r' if seg != total else '\n'))

                        if 'INFO:' in out:
                            if 'Outfile:' in out:
                                if '.srt' in out:
                                    data['INFO'] = 'Downloading subtitle: {}'.format(filename+'.srt')
                                if '.m4a' in out:
                                    data['INFO'] = 'Downloading audio: {}'.format(filename+'.m4a')
                                elif any(x in out for x in ('.mp4', '.ts')):
                                    data['INFO'] = 'Downloading video: {}'.format(filename+'.mp4' if '.mp4' in out else '.ts')
                            else:
                                data['INFO'] = out[6:]
                            # if not 'ETA: ' in out:
                            print (out)

                        if 'ERROR: ' in out:
                            data['ERROR'] = out[7:]
                            print (out)
                            error = True
                            child.terminate()
                            await asyncio.sleep(.1)
                        await websocket.send(json.dumps(data))
                break

    except (websockets.exceptions.ConnectionClosed, KeyboardInterrupt):
        if child.isalive():
            try:
                print('Terminating...')
                child.sendcontrol('c')
                child.terminate()
            except EnvironmentError:
                pass
            finally:
                for f in glob(tmpdir.rsplit('.')[0]+'*'):
                    os.remove(f)
                    print('Removed', f)
        print("Client disconnected.")
    except KeyboardInterrupt:
        sys.exit(1)

if __name__ == "__main__":
    server = websockets.serve(handler, host, port)
    loop = asyncio.get_event_loop()
    loop.run_until_complete(server)
    loop.run_forever()
