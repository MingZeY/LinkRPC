import type { RPCContext } from "./context.js";
/**
 * Packet处理中间件，常见于加密、过滤、压缩等
 * 当一个包进入或离开时，会调用该中间件进行处理
 */
class RPCMiddleware{

    async inbound(context:RPCContext,next:(context:RPCContext) => Promise<RPCContext>):Promise<RPCContext>{
        return next(context);
    }

    async outbound(context:RPCContext,next:(context:RPCContext) => Promise<RPCContext>):Promise<RPCContext>{
        return next(context);
    }
}


export {
    RPCMiddleware
}