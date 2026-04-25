import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCServer } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestBuildinHTTP extends TestCase{
    name(): string {
        return "BuildinHTTP";
    }

    private cleanFns:(() => Promise<any>)[] = [];

    async run(): Promise<boolean> {
        const define = new LinkRPCAPIDefine<{
            math:{
                add(a:number,b:number):number
            }
        }>();

        const server = new LinkRPCServer({
            local:define,
            provider:new LinkRPCBuildin.provider.http()
        });

        server.hook('math','add',{
            handler(a, b) {
                return a+b;
            },
        })
        await server.listen({
            port:3060
        })

        this.cleanFns.push(async () => {
            return await server.close();
        })

        const client = new LinkRPCClient({
            remote:define,
            provider:new LinkRPCBuildin.provider.http(),
        })

        const connection = await client.connect({
            port:3060
        })

        const api = client.getAPI(connection);
        const result = await api.math.add.call(1,2);
        this.asert({
            handler:() => result == 3,
            desc:"Add 1 and 2 should be 3",
        })
        return true;
    }

    public async finally(): Promise<void> {
        await Promise.all(this.cleanFns.map((fn) => fn()));
        return;
    }
}