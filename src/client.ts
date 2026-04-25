
import { LinkRPCConnection } from "./connection.js";
import { LinkRPCCore, LinkRPCCoreHub } from "./core.js";
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

    public emitter:TypedEmitter<LinkRPCClientEvents>;
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }
    public hub:LinkRPCCoreHub<L,R>;
    public provider:LinkRPCProvider;

    constructor(config?:LinkRPCClientConfig<L,R>){
        const defaultConfig:LinkRPCClientConfig<L,R> = {
            provider:new LinkRPCBuildin.provider.default(),
        }
        this.emitter = new TypedEmitter();
        config = {...defaultConfig,...config};
        this.define = {
            local:config.local,
            remote:config.remote,
        }
        if(!config.provider){
            throw new Error("Provider is undefined");
        }
        this.provider = config.provider;
        this.hub = new LinkRPCCoreHub({
            define:this.define,
        });
        this.initEvents();
    }

    private initEvents(){
        
    }

    public get hook(){
        return this.hub.hook.bind(this.hub);
    }

    public get hookService(){
        return this.hub.hookService.bind(this.hub);
    }

    public get use(){
        return this.hub.use.bind(this.hub);
    }

    public getAPI(connection:LinkRPCConnection):LinkRPCDefineToRPCAPI<R>{
        const core = this.hub.getCore(connection) || this.hub.setCore(connection);
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