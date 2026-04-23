import type { RPCPacket } from "./packet.js";
import { TypedEmitter } from "./utils.js";


type RPCConnectionEvents = {
    /** when connection receive a packet */
    receive:(packet:RPCPacket) => void;
    /** when connection closed */
    closed:() => void;
}

abstract class RPCConnection{

    public emitter = new TypedEmitter<RPCConnectionEvents>();

    /** send a packet through connection */
    abstract send(packet:RPCPacket):Promise<void>;
    /** close connection and release all resources */
    abstract close():Promise<void>;
    /** check if connection is closed */
    abstract isClosed():boolean;
    
}



export {
    RPCConnection
}