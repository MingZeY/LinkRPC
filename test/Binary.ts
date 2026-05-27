import { LinkRPCBuildin, LinkRPCClient } from "../src/index.js";
import { LinkRPCServer } from "../src/server.js";
import { TestCase } from "./TestCase.js";

export default class TestBinary extends TestCase{
    name(): string {
        return "Binary";
    }

    private cleanFns:(() => Promise<any>)[] = [];

    private async testBinaryPingPong(
        serverProvider: any,
        clientProvider: any,
        port: number,
        desc: string
    ): Promise<void> {
        const server = new LinkRPCServer({
            provider: serverProvider,
        })

        const client = new LinkRPCClient({
            provider: clientProvider
        })

        let clientResolve: (v: boolean) => void;
        const timeout = setTimeout(() => clientResolve(false), 5000);
        const clientReceived = new Promise<boolean>((resolve) => {
            clientResolve = resolve;
            server.emitter.on('connection',(connectionToClient) => {
                connectionToClient.emitter.on('binary',(rChannel,rData) => {
                    if(rChannel === 'chat'){
                        connectionToClient.sendBinary('chat',Buffer.from(`server: ${rData.toString()}`,'utf-8'))
                    }
                })
            })
        })

        await server.listen({port});
        this.cleanFns.push(async () => server.close());

        const connectionToServer = await client.connect({port});
        this.cleanFns.push(async () => client.provider.close());

        connectionToServer.emitter.once('binary',(channel,data) => {
            clientResolve(channel === 'chat' && data.toString() === 'server: hello');
        })

        connectionToServer.sendBinary('chat',Buffer.from('hello','utf-8'));

        const result = await clientReceived;
        clearTimeout(timeout);

        this.asert({
            handler:() => result,
            desc,
        })
    }

    private async testBinaryClientToServer(
        serverProvider: any,
        clientProvider: any,
        port: number,
        desc: string
    ): Promise<void> {
        const server = new LinkRPCServer({
            provider: serverProvider,
        })

        const client = new LinkRPCClient({
            provider: clientProvider
        })

        let serverResolve: (v: boolean) => void;
        const timeout = setTimeout(() => serverResolve(false), 5000);
        const serverReceived = new Promise<boolean>((resolve) => {
            serverResolve = resolve;
            server.emitter.on('connection',(connectionToClient) => {
                connectionToClient.emitter.on('binary',(rChannel,rData) => {
                    if(rChannel === 'chat'){
                        serverResolve(rData.toString() === 'hello');
                    }
                })
            })
        })

        await server.listen({port});
        this.cleanFns.push(async () => server.close());

        const connectionToServer = await client.connect({port});
        this.cleanFns.push(async () => client.provider.close());

        connectionToServer.sendBinary('chat',Buffer.from('hello','utf-8'));

        const result = await serverReceived;
        clearTimeout(timeout);

        this.asert({
            handler:() => result,
            desc,
        })
    }

    public async run(): Promise<boolean> {
        await this.testBinaryPingPong(
            new LinkRPCBuildin.provider.Memory(),
            new LinkRPCBuildin.provider.Memory(),
            1,
            "Memory binary ping-pong",
        )

        await this.testBinaryClientToServer(
            new LinkRPCBuildin.provider.HTTP(),
            new LinkRPCBuildin.provider.HTTP(),
            3060,
            "HTTP binary client->server",
        )

        await this.testBinaryPingPong(
            new LinkRPCBuildin.provider.Socket(),
            new LinkRPCBuildin.provider.Socket(),
            3061,
            "Socket binary ping-pong",
        )

        await this.testBinaryPingPong(
            new LinkRPCBuildin.provider.SocketIO(),
            new LinkRPCBuildin.provider.SocketIO(),
            3062,
            "SocketIO binary ping-pong",
        )

        await this.testBinaryPingPong(
            new LinkRPCBuildin.provider.Websocket(),
            new LinkRPCBuildin.provider.Websocket(),
            3063,
            "Websocket binary ping-pong",
        )

        return true;
    }

    public async finally(): Promise<void> {
        for (const fn of this.cleanFns) {
            await fn().catch(() => {});
        }
    }
}
