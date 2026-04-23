import { LinkRPCProviderHTTP } from "./connections/LinkRPCProviderHTTP.js"
import { LinkRPCProviderMemory } from "./connections/LinkRPCProviderMemory.js"
import { LinkRPCProviderSocket } from "./connections/LinkRPCProviderSocket.js"
import { LinkRPCProviderSocketIO } from "./connections/LinkRPCProviderSocketIO.js"
import { LinkRPCMiddlewareEssential } from "./middlewares/LinkRPCMiddlewareEssential.js"

const LinkRPCBuildin = {
    provider:{
        default:LinkRPCProviderHTTP,
        http:LinkRPCProviderHTTP,
        memory:LinkRPCProviderMemory,
        socket:LinkRPCProviderSocket,
        socketIO:LinkRPCProviderSocketIO,
    },
    middleware:{
        essential:LinkRPCMiddlewareEssential,
    }
}

export{
    LinkRPCBuildin
}