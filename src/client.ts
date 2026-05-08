
import { LinkRPCConnection } from "./connection.js";
import { LinkRPCAPIDefine, type LinkRPCAPIDefineType } from "./define.js";
import type { LinkRPCProvider } from "./provider.js";
import { TypedEmitter, type LinkRPCDefineToRPCAPI } from "./utils.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";
import { LinkRPCHub } from "./hub.js";
import type { LinkRPCPacket } from "./packet.js";



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
    // public hub:LinkRPCCoreHub<L,R>;
    public hub:LinkRPCHub<L,R>;
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
        // this.hub = new LinkRPCCoreHub({
        //     define:this.define,
        // });
        this.hub = new LinkRPCHub({
            define:this.define
        })
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
        // const core = this.hub.getCore(connection) || this.hub.setCore(connection);
        // return core.getAPI();
        return this.hub.getAPI(connection);
    }

    public async connect(params?:{
        port?:number,
        hostname?:string
    }):Promise<LinkRPCConnection>{
        const connection = await this.provider.connect(params);
        const reciveHandler = (packet:LinkRPCPacket) => {
            this.hub.inbound(connection,packet);
        }
        connection.emitter.on('receive',reciveHandler);
        connection.emitter.once('closed',() => {
            connection.emitter.off('receive',reciveHandler);
        })
        return connection;
    }

}

export {
    LinkRPCClient,
}