svtplay-dl-server
=================
A websocket server written in python running svtplay-dl through ``pexpect``, taking instructions from inbound in JSON format and pushing the output (including progress bar) to the client.

| The use of pexpect instead of ``svtplay_dl`` as a module is cumbersome, limited and buggy. But this will do for now until I've figured out a proper way to handle the IO.

svtplej.user.js
---------------
This is a client in the form of a userscript specifically for http://svtplay.se. My javascript skills are limited, but this get the job done and I'm pretty happy with it.

Requirements
~~~~~~~~~~~~
- Python 3.6
- websockets module
- pexpect module
- svtplay-dl
- Web browser

Known bugs
~~~~~~~~~~
- Sometimes something this might occur in the servers output: ::

    Outfile: filename [sXeY].mp4 [01/28][=.......................................] ETA: 0:00:00

Todo
~~~~
- Add setup.py
- Ditch ``pexpect`` for better IO with ``svtplay_dl`` module instead
- More clients: Chrome/Firefox extension
- Implement logging module

Contribute
''''''''''
I'm sure some bugs are occurring with the use of pexpect. Please fork and we can be happy together :)

License
*******
Coming soon

|

--------------

Älskar dig mamma. <3
