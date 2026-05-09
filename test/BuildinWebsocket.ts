import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCConnection, LinkRPCServer } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestBuildinWebsocket extends TestCase{
    name(): string {
        return "BuildinWebsocket";
    }

    private cleanFns:(() => Promise<any>)[] = [];

    async run(): Promise<boolean> {
        const ServerDefine = new LinkRPCAPIDefine<{
            math:{
                add(a:number,b:number):number
            }
        }>();

        const ClientDefine = new LinkRPCAPIDefine<{
            status:{
                ping():string;
            }
        }>();

        const server = new LinkRPCServer({
            local:ServerDefine,
            remote:ClientDefine,
            provider:new LinkRPCBuildin.provider.Websocket()
        });

        server.hook('math','add',{
            handler(a, b) {
                return a+b;
            },
        })
        
        let connectionToClient = new Promise<LinkRPCConnection>((resolve) => {
            server.emitter.once('connection',(connection) => {
                resolve(connection);
            })
        })
        await server.listen({
            port:3060
        })

        this.cleanFns.push(async () => {
            return await server.close();
        })

        const client = new LinkRPCClient({
            local:ClientDefine,
            remote:ServerDefine,
            provider:new LinkRPCBuildin.provider.Websocket(),
        })
        client.hook('status','ping',{
            handler() {
                return "pong";
            },
        });

        let connectionToServer = client.connect({
            port:3060
        })
        this.cleanFns.push(async () => {
            return (await connectionToServer).close();
        })

        let requestToServer = await connectionToServer.then((connection) => {
            return client.getInterface(connection).math.add(1,2)
        });

        let requestToClient = await connectionToClient.then((connection) => {
            return server.getInterface(connection).status.ping();
        })

        this.asert({
            handler:() => requestToServer == 3,
        })
        this.asert({
            handler:() => requestToClient == "pong",
        })

        // 关闭流程
        const connectionToServerOnClose = connectionToServer.then((connection) => {
            return new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(false);
                },1000)
                connection.emitter.once('closed',() => {
                    clearTimeout(timeout);
                    resolve(true);
                })
            })
        })

        const connectionToClientOnClose = connectionToClient.then((connection) => {
            return new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(false);
                },1000)
                connection.emitter.once('closed',() => {
                    clearTimeout(timeout);
                    resolve(true);
                })
            })
        })
        connectionToServer.then(c => c.close());

        await this.asert({
            handler:async() => await connectionToServerOnClose,
            desc:"connectionToServer not closed",
        })

        await this.asert({
            handler:async() => await connectionToClientOnClose,
            desc:"connectionToClient not closed",
        })

        return true;
    }

    public async finally(): Promise<void> {
        await Promise.all(this.cleanFns.map((fn) => fn()));
        return;
    }
}