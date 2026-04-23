import type { RPCConnection } from "./connection.js"
import { TypedEmitter } from "./utils.js"

type RPCProviderEvents = {
    /** when a provider receives a connection from a client after listening */
    connection(connection:RPCConnection):void,
}

abstract class RPCProvider{

    public emitter = new TypedEmitter<RPCProviderEvents>();

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
    }):Promise<RPCConnection>;

}

export{
    RPCProvider
}