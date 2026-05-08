
import { LinkRPCConnection } from "./connection.js";
import { LinkRPCAPIDefine, type LinkRPCAPIDefineType } from "./define.js";
import type { LinkRPCProvider } from "./provider.js";
import { TypedEmitter, type LinkRPCDefineToRPCAPI } from "./utils.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";
import { LinkRPCHub } from "./hub.js";
import type { LinkRPCPacket } from "./packet.js";



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
    public hub:LinkRPCHub<L,R>;

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
        // this.hub = new LinkRPCCoreHub({
        //     define:this.define
        // })
        this.hub = new LinkRPCHub({
            define:this.define
        })
        this.initEvents();
    }

    private initEvents(){
        this.provider.emitter.on('connection',(connection) => {
            this.emitter.emit('connection',connection);
            const reviceHandler = (packet:LinkRPCPacket) => {
                this.hub.inbound(connection,packet);
            }
            connection.emitter.on('receive',reviceHandler)
            connection.emitter.once('closed',() => {
                connection.emitter.off('receive',reviceHandler);
            })
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
        return this.hub.getAPI(connection);
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
    LinkRPCServer,
}