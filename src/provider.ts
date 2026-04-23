import type { LinkRPCConnection } from "./connection.js"
import { TypedEmitter } from "./utils.js"

type LinkRPCProviderEvents = {
    /** when a provider receives a connection from a client after listening */
    connection(connection:LinkRPCConnection):void,
}

abstract class LinkRPCProvider{

    public emitter = new TypedEmitter<LinkRPCProviderEvents>();

    /** only server, listen for connections and emit connection event */
    abstract listen(params?:{
        hostname?:string | undefined,
        port?:number | undefined
    }):Promise<void>;

    /** only server, close the server and stop listening for connections */
    abstract close():Promise<void>;

    /** only client, connect to server and return a connection to server */
    abstract connect(params?:{
        hostname?:string | undefined,
        port?:number | undefined
    }):Promise<LinkRPCConnection>;

}

export{
    LinkRPCProvider
}