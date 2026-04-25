
import { LinkRPCConnection } from "./connection.js";
import { LinkRPCCoreHub } from "./core.js";
import { LinkRPCAPIDefine, type LinkRPCAPIDefineType } from "./define.js";
import type { LinkRPCProvider } from "./provider.js";
import { TypedEmitter, type LinkRPCDefineToRPCAPI } from "./utils.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";



type LinkRPCServerConfig<L extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,R extends LinkRPCAPIDefine<LinkRPCAPIDefineType>> = {
    local?:L,
    remote?:R,
    provider?:LinkRPCProvider,
}

type LinkRPCServerEvents = {
    connection:(connection:LinkRPCConnection) => void,
}

class LinkRPCServer<L extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,R extends LinkRPCAPIDefine<LinkRPCAPIDefineType>> {
    public emitter:TypedEmitter<LinkRPCServerEvents>;
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }
    public provider:LinkRPCProvider;
    public hub:LinkRPCCoreHub<L,R>;

    constructor(config?:LinkRPCServerConfig<L,R>){
        const defaultConfig:LinkRPCServerConfig<L,R> = {
            provider:new LinkRPCBuildin.provider.default(),
        }
        config = {...defaultConfig,...config};
        this.emitter = new TypedEmitter();
        this.define = {
            local:config.local,
            remote:config.remote,
        }
        if(!config.provider){
            throw new Error("Provider is undefined");
        }
        this.provider = config.provider;
        this.hub = new LinkRPCCoreHub({
            define:this.define
        })
        this.initEvents();
    }

    private initEvents(){
        this.provider.emitter.on('connection',(connection) => {
            this.hub.setCore(connection);
            this.emitter.emit('connection',connection);
        })
    }

    public get use(){
        return this.hub.use.bind(this.hub);
    }

    public get hook(){
        return this.hub.hook.bind(this.hub);
    }

    public get hookService(){
        return this.hub.hookService.bind(this.hub);
    }


    public getAPI(connection:LinkRPCConnection):LinkRPCDefineToRPCAPI<R>{
        const core = this.hub.getCore(connection) || this.hub.setCore(connection);
        return core.getAPI();
    }

    public listen(params?:{
        port?:number | undefined,
        hostname?:string | undefined
    }):Promise<void>{
        return this.provider.listen(params);
    }

    public async close():Promise<void>{
        if(this.hub.isDestroyed()){
            return;
        }
        this.hub.destory();
        return this.provider.close();
    }

}

export {
    LinkRPCServer,
}