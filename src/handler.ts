import { RPCContextSymbol, type RPCContext } from "./context.js";
import { RPCPacketFactory, type RPCPacket, type RPCRequestPacket, type RPCResponsePacket } from "./packet.js";
import { TypedEmitter } from "./utils.js";



type RPCHandlerEvents = {
    
}
/**
 * 处理所有TypedRPC数据包，将 request packet 调用对应的 hook 转为 response packet
 * 并混合 Context 功能
 */
class RPCHandler{

    public emitter = new TypedEmitter<RPCHandlerEvents>();

    private hooks:Record<string,Record<string,{
        handler:(...args:any[])=>any,
        bind:any,
    }>> = {};


    /**
     * Add a hook function for the specified service method
     * @param serviceName Service name
     * @param methodName Method name
     * @param config Hook function configuration
     */
    hook(serviceName:string,methodName:string,config:{
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
    unhook(serviceName:string,methodName:string){
        if(!this.hooks[serviceName]){
            return;
        }
        delete this.hooks[serviceName]![methodName];
    }

    public async handle(request:RPCRequestPacket,context?:RPCContext):Promise<RPCResponsePacket>{
        const service = this.hooks[request.serviceName];
        if(!service){
            throw new Error(`Service ${request.serviceName} not found.`);
        }
        const hook = service[request.methodName];
        if(!hook){
            throw new Error(`Method hook ${request.methodName} not found.`);
        }
        const result = await hook.handler.call(new Proxy(hook.bind || {},{
            get(target,prop){
                if(prop === RPCContextSymbol){
                    return context;
                }
                return Reflect.get(target,prop);
            }
        }),...request.args);
        const response = RPCPacketFactory.createResponsePacket({
            requestId:request.id,
            result:result,
        });
        return response;
    }

    
}

export {
    RPCHandler,
}