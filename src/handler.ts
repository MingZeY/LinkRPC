import type { LinkRPCContext } from "./context.js";
import type { LinkRPCAPIDefine } from "./define.js";
import { LinkRPCPacketFactory, type LinkRPCRequestPacket, type LinkRPCResponsePacket } from "./packet.js";
import { LinkRPCContextSymbol } from "./symbol.js";
import { TypedEmitter } from "./utils.js";



type LinkRPCHandlerEvents = {
    
}
/**
 * 处理所有LinkRPC数据包，将 request packet 调用对应的 hook 转为 response packet
 * 并混合 Context 功能
 */
class LinkRPCHandler{

    public emitter = new TypedEmitter<LinkRPCHandlerEvents>();

    private define?:LinkRPCAPIDefine<any> | undefined;

    private hooks:Record<string,Record<string,{
        handler:(...args:any[])=>any,
        bind:any,
    }>> = {};

    constructor(define?:LinkRPCAPIDefine<any>){
        this.define = define;
    }


    /**
     * Add a hook function for the specified service method
     * @param serviceName Service name
     * @param methodName Method name
     * @param config Hook function configuration
     */
    public hook(serviceName:string,methodName:string,config:{
        handler:(...args:any[])=>any,
        bind?:any,
    }){
        if(!this.hooks[serviceName]){
            this.hooks[serviceName] = {};
        }
        if(this.hooks[serviceName]![methodName]){
            throw new Error(`Hook function for ${serviceName}.${methodName} already exists.check if it is overwritten or use unhook to remove it first.`);
        }
        this.hooks[serviceName]![methodName] = {
            handler:config.handler,
            bind:config.bind,
        };
    }

    /**
     * Remove the hook function for the specified service method
     * @param serviceName Service name
     * @param methodName Method name
     */
    public unhook(serviceName:string,methodName:string){
        if(!this.hooks[serviceName]){
            return;
        }
        delete this.hooks[serviceName]![methodName];
    }

    public async handle(request:LinkRPCRequestPacket,context?:LinkRPCContext):Promise<LinkRPCResponsePacket>{

        // get service
        const service = this.hooks[request.serviceName];
        if(!service){
            throw new Error(`handler not found.`);
        }

        // get config
        const config = this.define?.resolveMethodConfig(request.serviceName,request.methodName);

        // schema check
        const schema = config?.schema;
        if(schema?.args){
            try{
                request.args = await schema.args.parseAsync(request.args);
            }catch(e){
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId:request.id,
                    error:'bad request',
                })
            }
        }

        // get hook
        const hook = service[request.methodName];
        if(!hook){
            throw new Error(`handler not found.`);
        }

        let result = await hook.handler.call(new Proxy(hook.bind || {},{
            get(target,prop){
                if(prop === LinkRPCContextSymbol){
                    return context;
                }
                return Reflect.get(target,prop);
            }
        }),...request.args);

        // schema check
        if(schema?.return){
            try{
                result = await schema.return.parseAsync(result);
            }catch(e){
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId:request.id,
                    error:'bad response',
                })
            }
        }

        const response = LinkRPCPacketFactory.createResponsePacket({
            requestId:request.id,
            result:result,
        });
        return response;
    }

    
}

export {
    LinkRPCHandler,
}