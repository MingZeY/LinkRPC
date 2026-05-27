import type { LinkRPCPacket } from "./packet.js";
import { TypedEmitter } from "./utils.js";

const MAX_CHANNEL_NAME_LENGTH = 256;
const MAX_BINARY_PAYLOAD_SIZE = 100 * 1024 * 1024;

type LinkRPCConnectionEvents = {
    receive:(packet:LinkRPCPacket) => void;
    closed:() => void;
    binary:(channel:string,data:Uint8Array) => void;
}

abstract class LinkRPCConnection{

    public emitter = new TypedEmitter<LinkRPCConnectionEvents>();

    abstract send(packet:LinkRPCPacket):Promise<void>;
    abstract close():Promise<void>;
    abstract isClosed():boolean;

    sendBinary(channel:string,data:Uint8Array):Promise<void>{
        throw new Error("Method not implemented.");
    }
}

export {
    LinkRPCConnection,
    MAX_CHANNEL_NAME_LENGTH,
    MAX_BINARY_PAYLOAD_SIZE,
}
