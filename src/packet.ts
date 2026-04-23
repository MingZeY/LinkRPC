import { IdMaker } from "./utils.js";

export interface RPCPacket {
    id:string;
    type:string;
    meta?:{[key:string]:any};// 元数据，用于传递一些额外的信息
}

export interface RPCRequestPacket extends RPCPacket {
    type:'request';
    serviceName:string;
    methodName:string;
    args:any[];
}

export interface RPCResponsePacket extends RPCPacket {
    type:'response';
    requestId:string;
    result?:any;
    error?:any;
}



export class RPCPacketFactory {

    static createID():string{
        return IdMaker.makeId();
    }

    static createRequestPacket(data:{
        serviceName:string,
        methodName:string,
        args:any[]
    }):RPCRequestPacket{
        return {
            id:RPCPacketFactory.createID(),
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
    }):RPCResponsePacket{
        return {
            id:RPCPacketFactory.createID(),
            type:'response',
            requestId:data.requestId,
            result:data.result,
            error:data.error,
        }
    }

    static isPacket(data:any):data is RPCPacket{
        return data && typeof data === 'object' && 'id' in data && 'type' in data;
    }

    static isRequestPacket(data:any):data is RPCRequestPacket{
        if(!RPCPacketFactory.isPacket(data)){
            return false;
        }
        return data.type === 'request';
    }

    static isResponsePacket(data:any):data is RPCResponsePacket{
        if(!RPCPacketFactory.isPacket(data)){
            return false;
        }
        return data.type === 'response';
    }

    static parsePacketFromString(data:string):RPCPacket|undefined{
        let packet:any;
        try{
            packet = JSON.parse(data);
        }catch(e){
            return;
        }
        if(!RPCPacketFactory.isPacket(packet)){
            return;
        }
        return packet;
    }
}

