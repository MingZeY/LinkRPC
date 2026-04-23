import type { RPCAPIDefine, RPCAPIDefineType } from "./define.js";
import type { RPCRequestPacket, RPCResponsePacket } from "./packet.js";
import type { RPCDefineToRPCAPI } from "./utils.js";


class RPCAPI<T extends RPCAPIDefine<RPCAPIDefineType>>{
    constructor(){
        
    }

    interface(callback:(params:{
        serviceName:string,
        methodName:string,
        args:any[]
    }) => Promise<{
        request:RPCRequestPacket,
        response:RPCResponsePacket,
    }>):RPCDefineToRPCAPI<T>{
        return new Proxy({}, {
            get(target, serviceName, receiver) {
                if (typeof serviceName !== 'string') {
                    return Reflect.get(target, serviceName, receiver);
                }
                return new Proxy({}, {
                    get(target, methodName, receiver) {
                        if (typeof methodName !== 'string') {
                            return Reflect.get(target, methodName, receiver);
                        }
                        
                        const path = `${serviceName}.${methodName}`;
                        const id = `${serviceName}.${methodName}`;
                        
                        return {
                            call: async (...args: any[]) => {
                                const result = await callback({
                                    serviceName:serviceName,
                                    methodName:methodName,
                                    args:args,
                                });
                                if(result.response.error){
                                    throw new Error(result.response.error);
                                }
                                return result.response.result;
                            },
                            request:async (config:{
                                args?:any[],
                                callback?:(result:any,req:RPCRequestPacket,res:RPCResponsePacket) => void,
                                error?:(error:any,req:RPCRequestPacket,res:RPCResponsePacket) => void,
                            }) => {
                                const result = await callback({
                                    serviceName:serviceName,
                                    methodName:methodName,
                                    args:config.args || [],
                                });
                                if(result.response.error){
                                    config.error?.(result.response.error,result.request,result.response);
                                }else{
                                    config.callback?.(result.response.result,result.request,result.response);
                                }
                            },
                            id,
                            path
                        };
                    }
                });
            }
        }) as RPCDefineToRPCAPI<T>;
    }
}


export {
    RPCAPI
}