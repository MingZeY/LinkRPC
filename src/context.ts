import type { RPCCore } from "./core.js";
import type { RPCPacket, RPCRequestPacket, RPCResponsePacket } from "./packet.js"

type RPCContext = {
    core:RPCCore<any,any>,

    /** 当前正在进站的包 */
    inbound?:RPCPacket | undefined,

    /** 当前正在出站的包 */
    outbound?:RPCPacket | undefined,

    /** 对应的请求包 */
    request?:RPCRequestPacket | undefined,
    /** 对应的响应包 */
    response?:RPCResponsePacket | undefined,

    /** Context额外携带的信息 */
    extra?:Record<string,any> | undefined,
}

export const RPCContextSymbol = Symbol("RPCContext");
interface RPCContextAware{
    [RPCContextSymbol]:RPCContext | null,
}

export type {
    RPCContextAware,
    RPCContext,
}
