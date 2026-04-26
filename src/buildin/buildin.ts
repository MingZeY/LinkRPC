import { LinkRPCProviderHTTP } from "./connections/LinkRPCProviderHTTP.js"
import { LinkRPCProviderMemory } from "./connections/LinkRPCProviderMemory.js"
import { LinkRPCProviderSocket } from "./connections/LinkRPCProviderSocket.js"
import { LinkRPCProviderSocketIO } from "./connections/LinkRPCProviderSocketIO.js"
import { LinkRPCProviderWebsocket } from "./connections/LinkRPCProviderWebsocket.js"
import { LinkRPCMiddlewareEssential } from "./middlewares/LinkRPCMiddlewareEssential.js"

const LinkRPCBuildin = {
    provider:{
        default:LinkRPCProviderHTTP,
        HTTP:LinkRPCProviderHTTP,
        Memory:LinkRPCProviderMemory,
        Socket:LinkRPCProviderSocket,
        SocketIO:LinkRPCProviderSocketIO,
        Websocket:LinkRPCProviderWebsocket,
    },
    middleware:{
        Essential:LinkRPCMiddlewareEssential,
    }
}

export{
    LinkRPCBuildin
}