#!/usr/bin/env python3
"""
High-Performance Proxy Relay (Async) with Session Rotation
Runs locally on each server - handles 500+ concurrent connections
Each connection gets a UNIQUE session ID = UNIQUE Saudi IP
"""
import asyncio, base64, random, string, sys

PROXY_HOST = "proxy.packetstream.io"
PROXY_PORT = 31112
PROXY_USER = "fanar"
PROXY_PASS_BASE = "j7HGTQiRnys66RIM_country-SaudiArabia"
LISTEN_PORT = 18080
LISTEN_HOST = "0.0.0.0"
BUFFER_SIZE = 65536

def get_session_auth():
    """Generate unique auth with random session ID for each connection = unique IP"""
    session_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    password = f"{PROXY_PASS_BASE}_session-{session_id}"
    return base64.b64encode(f"{PROXY_USER}:{password}".encode()).decode()

async def pipe(reader, writer):
    try:
        while True:
            data = await asyncio.wait_for(reader.read(BUFFER_SIZE), timeout=60)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except:
        pass

async def handle_client(client_reader, client_writer):
    ps_writer = None
    try:
        # Read the initial request
        request = b""
        while b"\r\n\r\n" not in request:
            chunk = await asyncio.wait_for(client_reader.read(BUFFER_SIZE), timeout=15)
            if not chunk:
                client_writer.close()
                return
            request += chunk

        first_line = request.split(b"\r\n")[0].decode()
        method = first_line.split()[0]
        # Each connection gets a unique session = unique IP
        auth = get_session_auth()

        # Connect to PacketStream
        ps_reader, ps_writer = await asyncio.wait_for(
            asyncio.open_connection(PROXY_HOST, PROXY_PORT), timeout=10
        )

        if method == "CONNECT":
            # HTTPS tunnel
            target = first_line.split()[1]
            connect_req = (
                f"CONNECT {target} HTTP/1.1\r\n"
                f"Host: {target}\r\n"
                f"Proxy-Authorization: Basic {auth}\r\n"
                f"Proxy-Connection: keep-alive\r\n\r\n"
            )
            ps_writer.write(connect_req.encode())
            await ps_writer.drain()

            # Read response
            resp = b""
            while b"\r\n\r\n" not in resp:
                chunk = await asyncio.wait_for(ps_reader.read(BUFFER_SIZE), timeout=10)
                if not chunk:
                    break
                resp += chunk

            if b"200" in resp.split(b"\r\n")[0]:
                client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await client_writer.drain()
                # Bidirectional tunnel
                await asyncio.gather(
                    pipe(client_reader, ps_writer),
                    pipe(ps_reader, client_writer),
                )
            else:
                client_writer.write(resp)
                await client_writer.drain()
        else:
            # HTTP proxy - inject auth
            lines = request.split(b"\r\n")
            new_lines = [lines[0]]
            for line in lines[1:]:
                if line.lower().startswith(b"proxy-authorization"):
                    continue
                new_lines.append(line)
            new_lines.insert(1, f"Proxy-Authorization: Basic {auth}".encode())
            ps_writer.write(b"\r\n".join(new_lines))
            await ps_writer.drain()

            # Forward response
            while True:
                data = await asyncio.wait_for(ps_reader.read(BUFFER_SIZE), timeout=30)
                if not data:
                    break
                client_writer.write(data)
                await client_writer.drain()

    except:
        pass
    finally:
        try:
            client_writer.close()
        except:
            pass
        try:
            if ps_writer:
                ps_writer.close()
        except:
            pass

async def main():
    server = await asyncio.start_server(
        handle_client, LISTEN_HOST, LISTEN_PORT,
        limit=BUFFER_SIZE,
        backlog=1024,
    )
    print(f"Relay on {LISTEN_HOST}:{LISTEN_PORT} (Session Rotation = Unique IP per visit)", flush=True)
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    asyncio.run(main())
