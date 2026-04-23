import type { RPCConnection } from "../src/connection.js";
import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCServer } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestBuildinSocketIO extends TestCase{
    name(): string {
        return "BuildinSocketIO";
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
            provider:new LinkRPCBuildin.provider.socketIO()
        });

        server.hook('math','add',{
            handler(a, b) {
                return a+b;
            },
        })
        
        let connectionToClient = new Promise<RPCConnection>((resolve) => {
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
            provider:new LinkRPCBuildin.provider.socketIO(),
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
            return client.getAPI(connection).math.add.call(1,2)
        });

        let requestToClient = await connectionToClient.then((connection) => {
            return server.getAPI(connection).status.ping.call();
        })

        this.asert({
            handler:() => requestToServer == 3,
        })
        this.asert({
            handler:() => requestToClient == "pong",
        })

        return true;
    }

    public async finally(): Promise<void> {
        await Promise.all(this.cleanFns.map((fn) => fn()));
        return;
    }
}