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
import os, re, asyncio, websockets, json, pexpect, argparse
from glob import glob
from shutil import move, rmtree
from tempfile import gettempdir

__version__ = '1.2.0'

parser = argparse.ArgumentParser(description='A gateway for svtplay-dl in the form of a WebSocket server.', epilog="Default host is 0.0.0.0 which points to localhost, LAN IP and/or WAN IP. 0.0.0.0 means listening on anything that has network access to this computer. Change 'host' to localhost or 127.0.0.1 if you want to strictly run it locally.")
parser.add_argument('host', metavar='HOST', nargs='?', default='0.0.0.0', help='host address (default: 0.0.0.0)')
parser.add_argument('-p', '--port', metavar='PORT', type=int, default=5000, help='port (default: 5000)')
args = parser.parse_args()

# Default 'host' points to localhost, LAN IP and/or WAN IP.
# 0.0.0.0 means listening on anything that has network access to this computer.
# Change 'host' to localhost or 127.0.0.1 if you want to strictly run it locally.
host = args.host
port = args.port

print('Running on {}:{}'.format(host, port))

connected = set()

async def handler(websocket, path):
    try:
        while True:
            try:
                inbound = json.loads(await websocket.recv())
            except json.decoder.JSONDecodeError:
                print('ERROR: Inbound was not in JSON format.')
                return
            if inbound is None:
                return

            if 'articleId' in inbound:
                articleId = inbound['articleId']
                if articleId in connected:
                    websocket.close()
                    return
                print("New client connected.")
                await websocket.send(json.dumps({'status': 'CONNECTED'}))
                connected.add(articleId)

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
                if '/' in title:
                    title = title.replace('/', '\u2571')
                    inbound['title'] = title
                if 'info' in inbound:
                    info = inbound['info']
                    if info and '/' in info:
                        info = info.replace('/', '\u2571')

                if 'season' in inbound:
                    season = inbound['season']
                if 'episode' in inbound:
                    episode = inbound['episode']

            if 'format' in inbound:
                fmt = inbound['format']
            if 'cmd_options' in inbound:
                opts = inbound['cmd_options']
                if '-A' in opts:
                    DownloadAll = True
                else:
                    DownloadAll = False
            else:
                opts = ''

            if inbound['tmpdir'] and inbound['tmpdir'] != 'default':
                tmpdir = os.path.join(inbound['tmpdir'], articleId+os.sep if articleId else '')
            else:
                tmpdir = os.path.join(gettempdir(), 'svtplay_downloads', articleId+os.sep if articleId else '') # use default tmp directory if tmpdir is not set in json
                if inbound['tmpdir'] != 'default':
                  await websocket.send(json.dumps({'INFO': 'Temp path not set. Using default: {}'.format(os.path.dirname(tmpdir.rstrip(os.sep)))}))
                inbound['tmpdir'] = tmpdir

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

                def cleanup():
                    print("Client disconnected.")
                    connected.discard(articleId)
                    if child.isalive():
                        try:
                            print('Terminating...')
                            child.sendcontrol('c')
                            child.terminate()
                        except EnvironmentError:
                            pass
                        finally:
                            if DownloadAll:
                                rmtree(tmpdir)
                                print('Removed', tmpdir)
                            else:
                                for f in glob(tmpdir+'*'):
                                    os.remove(f)
                                    print('Removed', f)
                                os.rmdir(tmpdir)

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

                        if DownloadAll:
                            move(os.path.join(tmpdir, filename), os.path.dirname(path))
                            moved = "Moved directory '{}' into '{}'".format(filename, os.path.dirname(path))
                        else:
                            pattern = re.sub(r'\[', '[[]', os.path.join(tmpdir, filename))
                            pattern = re.sub(r'(?<!\[)\].*', '[]]', pattern)
                            for f in glob(pattern+'*'):
                                dest = os.path.join(os.path.dirname(path), os.path.basename(f))
                                if os.path.isfile(dest):
                                  os.remove(dest)
                                move(f, os.path.dirname(path))
                                moved = "Moved '{}' into '{}'".format(os.path.basename(f), os.path.dirname(path))
                        print(moved)
                        os.rmdir(tmpdir)
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
                                if DownloadAll:
                                  f = glob(os.path.join(tmpdir, filename, '*'))
                                  f.sort(key=os.path.getmtime, reverse=True)
                                  f = os.path.basename(f[0]).rsplit('.', 1)[0]
                                else:
                                  f = filename
                                if '.srt' in out:
                                    data['INFO'] = 'Downloading subtitle: {}{}'.format(f, '.srt')
                                if '.m4a' in out:
                                    data['INFO'] = 'Downloading audio: {}{}'.format(f, '.m4a')
                                elif any(x in out for x in ('.mp4', '.ts')):
                                    data['INFO'] = 'Downloading video: {}{}'.format(f, '.mp4' if '.mp4' in out else '.ts')
                            else:
                                data['INFO'] = out[6:]
                            print (out)

                        if 'ERROR: ' in out:
                            data['ERROR'] = out[7:]
                            print (out)
                            if not 'Setting language as undetermined.' in out:
                                error = True
                                child.terminate()
                        await websocket.send(json.dumps(data))
                break

    except KeyboardInterrupt:
        print('\rctrl-c called: Download cancelled. Press ctrl-c again to shut down server.')
        websocket.close()
        cleanup()
        pass
    except websockets.exceptions.ConnectionClosed:
        cleanup()

if __name__ == "__main__":
    server = websockets.serve(handler, host, port)
    loop = asyncio.get_event_loop()
    tasks = asyncio.gather(
      asyncio.ensure_future(server)
    )

    try:
        loop.run_until_complete(tasks)
        loop.run_forever()
    except KeyboardInterrupt:
        print("\rCanceling tasks and shutting down...")
        tasks.cancel()
        # loop.run_forever()
        tasks.exception()
    finally:
        loop.close()
        sys.exit(0)