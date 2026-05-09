import type { LinkRPCAPIDefine, LinkRPCAPIDefineType } from "./define.js";
import type { LinkRPCRequestPacket, LinkRPCResponsePacket } from "./packet.js";
import type { LinkRPCDefineToRPCAPI } from "./utils.js";


class LinkRPCAPI<T extends LinkRPCAPIDefine<LinkRPCAPIDefineType>>{
    
    constructor(){
        
    }

    interface(callback:(params:{
        serviceName:string,
        methodName:string,
        args:any[]
    }) => Promise<{
        request:LinkRPCRequestPacket,
        response:LinkRPCResponsePacket,
    }>):LinkRPCDefineToRPCAPI<T>{
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
                                callback?:(result:any,req:LinkRPCRequestPacket,res:LinkRPCResponsePacket) => void,
                                error?:(error:any,req:LinkRPCRequestPacket,res:LinkRPCResponsePacket) => void,
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
        }) as LinkRPCDefineToRPCAPI<T>;
    }
}


export {
    LinkRPCAPI
}