import {useRouter} from "next/router";
import {useEffect, useMemo, useRef} from "react";
import calculatePrice from "../../lib/calculatePrice";
import BackLink from "../../components/BackLink";
import PageHeading from "../../components/PageHeading";
import {clusterApiUrl, Connection, Keypair} from "@solana/web3.js";
import {
    createQR,
    encodeURL,
    EncodeURLComponents, findTransactionSignature,
    FindTransactionSignatureError, validateTransactionSignature,
    ValidateTransactionSignatureError
} from "@solana/pay";
import {shopAddress, usdcAddress} from "../../lib/addresses";
import {WalletAdapterNetwork} from "@solana/wallet-adapter-base";


export default function Checkout(){
    const router= useRouter()

    //ref to a div where we'll show the QR Code
    const qrRef= useRef<HTMLDivElement>(null)

    const amount= useMemo(()=>calculatePrice(router.query),[router.query])

    //unique address that we can listen for payments to
    const reference = useMemo(()=>Keypair.generate().publicKey,[])


    // Get a connection to Solana devnet
    const network = WalletAdapterNetwork.Testnet
    const endpoint = clusterApiUrl(network)
    const connection = new Connection(endpoint)


    //Solana Pay transfer params (Encode is provided by Solana Pay)
    //If you want to charge in SOL with Solana Pay that’s super easy: just remove splToken from EncodeURLComponents.
    // It’s an optional field and if it’s missing then everything will use SOL.
    const urlParams: EncodeURLComponents={
        recipient:shopAddress,
        splToken:usdcAddress,
        amount,
        reference,
        label:"GUIDE-X Solana",
        message:"Thanks for your order! 🎣"
    }

    //Encode the params into the format shown
    //starts with Shop's public key, then shows amount, the SPL token, the reference, label and message.
    //Label and message will show up in the user's mobile wallet for transaction detaiils
    const url= encodeURL(urlParams)

    //Show the QR Code
    useEffect(()=>{
        const qr= createQR(url,512,'transparent')
        if (qrRef.current && amount.isGreaterThan(0)){
            qrRef.current.innerHTML=''
            qr.append(qrRef.current)
        }

    })

    //Check every .5sec to see if the transaction completed
    useEffect(()=>{
        const interval= setInterval(async ()=>{
            try{
                //Check if there is any transaction for the reference
                //Solana transactions are confirmed really quickly, but take a few extra seconds to get finalized
                //If you are doing really big transactions, you might prefer finalized
                const signatureInfo = await findTransactionSignature(connection, reference,{},'confirmed')
                //Validate that the transaction has the expected recipient, amount and SPL token
                await validateTransactionSignature(connection,signatureInfo.signature,shopAddress,
                    amount,usdcAddress,reference,'confirmed')
                router.push('/shop/confirmed')
            }catch (err){
                if (err instanceof FindTransactionSignatureError){
                    //No transaction found yet, just ingore this error
                return
                }
                if (err instanceof  ValidateTransactionSignatureError){
                    //Transaction is invalid
                    console.error("Transaction is invalid",err)
                    return
                }
                console.error("unknown error",err)
            }
        },500)
    },[])

    return(
        <div className="flex flex-col gap-8 items-center">
            <BackLink href={'/shop'}>Cancel</BackLink>
            <PageHeading>Checkout ${amount.toString()}</PageHeading>
            <div ref={qrRef} />
        </div>
    )
}