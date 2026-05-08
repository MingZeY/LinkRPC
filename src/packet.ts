import { IdMaker } from "./utils.js";

export interface LinkRPCPacket {
    id:string;
    type:string;
    meta?:{[key:string]:any};// 元数据，用于传递一些额外的信息
}

export interface LinkRPCRequestPacket extends LinkRPCPacket {
    type:'request';
    serviceName:string;
    methodName:string;
    args:any[];
}

export interface LinkRPCResponsePacket extends LinkRPCPacket {
    type:'response';
    requestId:string;
    result?:any;
    error?:any;
}

export interface LinkRPCCustomPacket extends LinkRPCPacket {
    type:'custom';
    data:any;
}

export class LinkRPCPacketFactory {

    static createID():string{
        return IdMaker.makeId();
    }

    static createRequestPacket(data:{
        serviceName:string,
        methodName:string,
        args:any[]
    }):LinkRPCRequestPacket{
        return {
            id:LinkRPCPacketFactory.createID(),
            type:'request',
            serviceName:data.serviceName,
            methodName:data.methodName,
            args:data.args,
        }
    }

    static createResponsePacket(data:{
        requestId:string,
        result?:any,
        error?:any,
    }):LinkRPCResponsePacket{
        return {
            id:LinkRPCPacketFactory.createID(),
            type:'response',
            requestId:data.requestId,
            result:data.result,
            error:data.error,
        }
    }

    static isPacket(data:any):data is LinkRPCPacket{
        return data && typeof data === 'object' && 'id' in data && 'type' in data;
    }

    static isRequestPacket(data:any):data is LinkRPCRequestPacket{
        if(!LinkRPCPacketFactory.isPacket(data)){
            return false;
        }
        return data.type === 'request';
    }

    static isResponsePacket(data:any):data is LinkRPCResponsePacket{
        if(!LinkRPCPacketFactory.isPacket(data)){
            return false;
        }
        return data.type === 'response';
    }

    static parsePacketFromString(data:string):LinkRPCPacket|undefined{
        let packet:any;
        try{
            packet = JSON.parse(data);
        }catch(e){
            return;
        }
        if(!LinkRPCPacketFactory.isPacket(packet)){
            return;
        }
        return packet;
    }
}

