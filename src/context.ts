import type { LinkRPCConnection } from "./connection.js";
import type { LinkRPCAPIDefine } from "./define.js";
import type { LinkRPCHub } from "./hub.js";
import type { LinkRPCPacket, LinkRPCRequestPacket, LinkRPCResponsePacket } from "./packet.js"
import type { LinkRPCContextSymbol } from "./symbol.js";

type LinkRPCContext = {
    // core:LinkRPCCore<any,any>,
    hub:LinkRPCHub<LinkRPCAPIDefine<any>,LinkRPCAPIDefine<any>>,

    connection:LinkRPCConnection,

    /** 当前正在进站的包 */
    inbound?:LinkRPCPacket | undefined,

    /** 当前正在出站的包 */
    outbound?:LinkRPCPacket | undefined,

    /** 对应的请求包 */
    request?:LinkRPCRequestPacket | undefined,
    /** 对应的响应包 */
    response?:LinkRPCResponsePacket | undefined,

    /** Context额外携带的信息 */
    extra?:Record<string,any> | undefined,
}

interface LinkRPCContextAware{
    [LinkRPCContextSymbol]:LinkRPCContext | undefined,
}

export type {
    LinkRPCContextAware,
    LinkRPCContext,
}
