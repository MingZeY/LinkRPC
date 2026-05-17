import { LinkRPCAPIDefine,  LinkRPCConnection,  LinkRPCHub, LinkRPCPacketFactory, LinkRPCSchemaBuilder, type LinkRPCContext} from "../src/index.js";
import { TestCase } from "./TestCase.js";


export default class TestDefine extends TestCase{
    name(): string {
        return "Define";
    }
    async run(): Promise<boolean> {

        type DefineType = {
            Math:{
                add(a:number,b:number):Promise<number>,
            },
            String:{
                concat(a:string,b:string):Promise<string>,
            }
        }

        const define = new LinkRPCAPIDefine<DefineType>()

        const builder = new LinkRPCSchemaBuilder();

        define.setSchemaAll({
            Math:{
                add:{
                    args:builder.build(t => t.args(t.number(),t.number())),
                    return:builder.build(t => t.promise(t.number())),
                }
            },
            String:{
                concat:{
                    args:builder.build(t => t.args(t.string(),t.string())),
                    return:builder.build(t => t.promise(t.string()))
                }
            }
        });

        const hub = new LinkRPCHub<typeof define,any>({
            define:{
                local:define,
            }
        })

        hub.hook('Math','add',{
            handler: async (a, b) => {
                return a+b;
            },
        })

        const requestPacket = LinkRPCPacketFactory.createRequestPacket({
            serviceName:'Math',
            methodName:'add',
            args:[1,2],
        })

        const requestContext:LinkRPCContext = {
            hub:hub,
            connection:undefined as unknown as LinkRPCConnection,
            inbound:requestPacket,
            request:requestPacket,
        }
        const responseContext = await hub.inboundContext(requestContext,false);

        await this.asert({
            handler:() => responseContext.response?.result == 3
        })

        const badRequestPacket = LinkRPCPacketFactory.createRequestPacket({
            serviceName:'Math',
            methodName:'add',
            args:[1,'2'],
        })

        const badRequestContext:LinkRPCContext = {
            hub:hub,
            connection:undefined as unknown as LinkRPCConnection,
            inbound:badRequestPacket,
            request:badRequestPacket,
        }
        const badResponseContext = await hub.inboundContext(badRequestContext,false);
        await this.asert({
            handler:() => badResponseContext.response?.error != undefined
        });
        
        return true;

    }

}