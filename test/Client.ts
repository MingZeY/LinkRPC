import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCServer } from "../src/index.js";
import { TestCase } from "./TestCase.js";

export default class TestClient extends TestCase{
    name(): string {
        return "Client";
    }
    public async run(): Promise<boolean> {
        const define = new LinkRPCAPIDefine<{
            math:{
                add(a:number,b:number):number
            }
        }>()

        const server = new LinkRPCServer({
            local:define,
            provider:new LinkRPCBuildin.provider.Memory()
        });
        server.hook('math','add',{
            handler(a, b) {
                return a+b;
            },
        })
        await server.listen({port:1})

        const client = new LinkRPCClient({
            remote:define,
            provider:new LinkRPCBuildin.provider.Memory()
        })
        const connection = await client.connect({port:1});
        const interfaces = client.getInterface(connection);
        const result = await interfaces.math.add(1,2);
        this.asert({
            handler: () => result == 3,
            desc:'result should be 3',
        });

        connection.close();
        server.close();
        return true;
    }
}