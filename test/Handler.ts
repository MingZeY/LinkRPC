import { LinkRPCHandler, LinkRPCPacketFactory } from "../src/index.js";
import { TestCase } from "./TestCase.js";



export default class TestHandler extends TestCase{
    name(): string {
        return "Handler";
    }

    async run(): Promise<boolean> {
        const handler = new LinkRPCHandler();
        handler.hook('math','add',{
            handler(a,b) {
                return a + b;
            },
        })

        const response = await handler.handle(LinkRPCPacketFactory.createRequestPacket({
            serviceName:'math',
            methodName:'add',
            args:[1,2]
        }))

        this.asert({
            handler:() => response.result == 3,
            desc:"Response result is not 3",
        })

        return true;
    }   
}