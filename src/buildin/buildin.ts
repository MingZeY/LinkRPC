import { RPCProviderHTTP } from "./connections/RPCProviderHTTP.js"
import { RPCProviderMemory } from "./connections/RPCProviderMemory.js"
import { RPCProviderSocket } from "./connections/RPCProviderSocket.js"
import { RPCProviderSocketIO } from "./connections/RPCProviderSocketIO.js"
import { RPCMiddlewareEssential } from "./middlewares/RPCMiddlewareEssential.js"

const RPCBuildin = {
    provider:{
        default:RPCProviderHTTP,
        http:RPCProviderHTTP,
        memory:RPCProviderMemory,
        socket:RPCProviderSocket,
        socketIO:RPCProviderSocketIO,
    },
    middleware:{
        essential:RPCMiddlewareEssential,
    }
}

export{
    RPCBuildin
}