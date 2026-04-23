
import { LinkRPCConnection } from "./connection.js";
import { LinkRPCCore } from "./core.js";
import { LinkRPCAPIDefine, type LinkRPCAPIDefineType } from "./define.js";
import type { LinkRPCProvider } from "./provider.js";
import { TypedEmitter, type LinkRPCDefineMethodBody, type LinkRPCDefineMethodName, type LinkRPCDefineServiceInstance, type LinkRPCDefineServiceName, type LinkRPCDefineToRPCAPI } from "./utils.js";
import { LinkRPCHandler } from "./handler.js";
import type { LinkRPCMiddleware } from "./middleware.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";



type LinkRPCClientConfig<L extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,R extends LinkRPCAPIDefine<LinkRPCAPIDefineType>> = {
    local?:L,
    remote?:R,
    provider?:LinkRPCProvider,
}

type LinkRPCClientEvents = {
    connection:(connection:LinkRPCConnection) => void,
}

class LinkRPCClient<L extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,R extends LinkRPCAPIDefine<LinkRPCAPIDefineType>> {

    public emitter = new TypedEmitter<LinkRPCClientEvents>();
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }

    public handler:LinkRPCHandler = new LinkRPCHandler();
    public provider:LinkRPCProvider;
    public middlewares:LinkRPCMiddleware[] = [];

    constructor(config?:LinkRPCClientConfig<L,R>){
        const defaultConfig:LinkRPCClientConfig<L,R> = {
            provider:new LinkRPCBuildin.provider.default(),
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
        this.middlewares.push(new LinkRPCBuildin.middleware.essential());
        this.initEvents();
    }

    private initEvents(){
        this.provider.emitter.on('connection',(connection) => {
            const core = new LinkRPCCore({
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

    public hook<S extends LinkRPCDefineServiceName<L>,M extends LinkRPCDefineMethodName<L,S>>(serviceName:S,methodName:M,config:{
        handler:LinkRPCDefineMethodBody<L,S,M>,
        bind?:any,
    }){
        this.handler.hook(serviceName,methodName,config);
    }

    public hookService<S extends LinkRPCDefineServiceName<L>>(serviceName:S,instance:LinkRPCDefineServiceInstance<L,S>){
        const methodList = LinkRPCAPIDefine.getMethodList(instance);
        for(let methodName of methodList){
            this.hook(serviceName,methodName as LinkRPCDefineMethodName<L,S>,{
                handler:instance[methodName],
                bind:instance,
            })
        }
    }

    public use(middleware:LinkRPCMiddleware){
        this.middlewares.push(middleware);
    }


    public getAPI(connection:LinkRPCConnection):LinkRPCDefineToRPCAPI<R>{
        const core = new LinkRPCCore({
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

    public async connect(params?:{
        port?:number,
        hostname?:string
    }):Promise<LinkRPCConnection>{
        return this.provider.connect(params);
    }

}

export {
    LinkRPCClient,
}