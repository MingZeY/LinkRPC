import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCContextSymbol, LinkRPCServer, type LinkRPCContext, type LinkRPCContextAware } from "../src/index.js";
import { TestCase } from "./TestCase.js";

type DefineServerMathService = {
    add(a:number,b:number):number
}

type DefineServerType = {
    math:DefineServerMathService
}

const DefineServer = new LinkRPCAPIDefine<DefineServerType>();


class MathService implements DefineServerMathService,LinkRPCContextAware{

    [LinkRPCContextSymbol]: LinkRPCContext | undefined;

    @LinkRPCAPIDefine.method()
    add(a: number, b: number): number {
        // 使用Context进行计算
        const context = this[LinkRPCContextSymbol];
        if(!context?.request?.args
        || typeof context.request.args[0] !== 'number'
        || typeof context.request.args[1] !== 'number'
        ){
            throw new Error("Context Error");
        }
        return context.request.args[0] + context.request.args[1];
    }
    
}

export default class TestContext extends TestCase{
    name(): string {
        return "Context";
    }

    private cleanFns:(() => Promise<any>)[] = [];

    async run(): Promise<boolean> {

        const server = new LinkRPCServer({
            local:DefineServer,
            provider:new LinkRPCBuildin.provider.HTTP()
        });

        server.hookService('math',new MathService());

        await server.listen({
            port:3060
        })

        this.cleanFns.push(async () => {
            return await server.close();
        })

        const client = new LinkRPCClient({
            remote:DefineServer,
            provider:new LinkRPCBuildin.provider.HTTP(),
        })

        const connection = await client.connect({
            port:3060
        })

        const interfaces = client.getInterface(connection);
        const result = await interfaces.math.add(1,2);
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