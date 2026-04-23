
import { RPCConnection } from "./connection.js";
import { RPCCore } from "./core.js";
import { RPCAPIDefine, type RPCAPIDefineType } from "./define.js";
import type { RPCProvider } from "./provider.js";
import { TypedEmitter, type RPCDefineMethodBody, type RPCDefineMethodName, type RPCDefineServiceInstance, type RPCDefineServiceName, type RPCDefineToRPCAPI } from "./utils.js";
import { RPCHandler } from "./handler.js";
import type { RPCMiddleware } from "./middleware.js";
import { RPCBuildin } from "./buildin/buildin.js";



type RPCServerConfig<L extends RPCAPIDefine<RPCAPIDefineType>,R extends RPCAPIDefine<RPCAPIDefineType>> = {
    local?:L,
    remote?:R,
    provider?:RPCProvider,
}

type RPCServerEvents = {
    connection:(connection:RPCConnection) => void,
}

class RPCServer<L extends RPCAPIDefine<RPCAPIDefineType>,R extends RPCAPIDefine<RPCAPIDefineType>> {

    public emitter = new TypedEmitter<RPCServerEvents>();
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }

    public handler:RPCHandler = new RPCHandler();
    public provider:RPCProvider;
    public middlewares:RPCMiddleware[] = [];

    constructor(config?:RPCServerConfig<L,R>){
        const defaultConfig:RPCServerConfig<L,R> = {
            provider:new RPCBuildin.provider.default(),
        }
        config = {...defaultConfig,...config};
        this.define = {
            local:config.local,
            remote:config.remote,
        }
        if(!config.provider){
            throw new Error("Provider is undefined");
        }
        this.provider = config.provider;
        this.middlewares.push(new RPCBuildin.middleware.essential());
        this.initEvents();
    }

    private initEvents(){
        this.provider.emitter.on('connection',(connection) => {
            const core = new RPCCore({
                connection,
                handler:this.handler,
                middlewares:this.middlewares,
                define:this.define,
            });
            connection.emitter.on('closed',() => {
                core.destroy();
            })
            this.emitter.emit('connection',connection);
        })
    }

    public use(middleware:RPCMiddleware){
        this.middlewares.push(middleware);
    }

    public hook<S extends RPCDefineServiceName<L>,M extends RPCDefineMethodName<L,S>>(serviceName:S,methodName:M,config:{
        handler:RPCDefineMethodBody<L,S,M>,
        bind?:any,
    }){
        this.handler.hook(serviceName,methodName,config);
    }

    public hookService<S extends RPCDefineServiceName<L>>(serviceName:S,instance:RPCDefineServiceInstance<L,S>){
        const methodList = RPCAPIDefine.getMethodList(instance);
        for(let methodName of methodList){
            this.hook(serviceName,methodName as RPCDefineMethodName<L,S>,{
                handler:instance[methodName],
                bind:instance,
            })
        }
    }


    public getAPI(connection:RPCConnection):RPCDefineToRPCAPI<R>{
        const core = new RPCCore({
            connection,
            handler:this.handler,
            middlewares:this.middlewares,
            define:this.define,
        });
        if(!this.define.remote){
            throw new Error("Remote define is undefined");
        }
        return core.getAPI();
    }

    public listen(params?:{
        port?:number | undefined,
        hostname?:string | undefined
    }):Promise<void>{
        return this.provider.listen(params);
    }

    public async close():Promise<void>{
        return this.provider.close();
    }

}

export {
    RPCServer,
}