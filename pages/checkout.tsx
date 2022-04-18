import {useRouter} from "next/router";
import BackLink from "../components/BackLink";
import PageHeading from "../components/PageHeading";
import calculatePrice from "../lib/calculatePrice";
import {useConnection, useWallet} from "@solana/wallet-adapter-react";
import {useEffect, useMemo, useState} from "react";
import {Keypair, Transaction} from "@solana/web3.js";
import {MakeTransactionInputData, MakeTranscationOutputData} from "./api/makeTransaction";
import {WalletMultiButton} from "@solana/wallet-adapter-react-ui";
import Loading from "../components/Loading";
import {findTransactionSignature, FindTransactionSignatureError} from "@solana/pay";

export default function Checkout() {
    const router = useRouter()
    const {connection} = useConnection();
    //Reads the wallet from the home page. Null if there is no connected wallet
    // sendTransaction lets us send a transaction using the connected wallet
    const {publicKey, sendTransaction} = useWallet()
    const amount = calculatePrice(router.query)

    //State to hold API response fields
    const [transaction, setTransaction] = useState<Transaction | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    //Read the URL Query (which includes our chosen products) and convert to a URLSearchParams Object
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(router.query)) {
        if (value) {
            if (Array.isArray(value)) {
                for (const v of value) {
                    searchParams.append(key, v)
                }
            } else {
                searchParams.append(key, value)
            }
        }
    }
    //Generate the unique reference which will be used for this transaction (like a GUID I guess)
    const reference = useMemo(() => Keypair.generate().publicKey, [])

    //Add it the parmams we'll pass to the API
    searchParams.append('reference', reference.toString())

    //Use our API to fetch the transaction for the selected items
    async function getTransaction() {
        if (!publicKey) {
            return
        }

        const body: MakeTransactionInputData = {
            account: publicKey.toString()
        }

        const response = await fetch(`/api/makeTransaction?${searchParams.toString()}`, {
            method: 'POST',
            headers: {
                'Content-Type': "application/json"
            },
            body: JSON.stringify(body)
        })

        const json = await response.json() as MakeTranscationOutputData

        if (response.status !== 200) {
            console.error(json)
            return
        }

        //Deserializee the transaction from the response
        const transaction = Transaction.from(Buffer.from(json.transaction, 'base64'));
        setTransaction(transaction)
        setMessage(json.message)
        console.log("transaction is", transaction)

    }

    useEffect(() => {
        getTransaction()
    }, [publicKey])

    //Send the fetched transaction to the connected wallet
    async function trySendTransaction() {
        if (!transaction) {
            return
        }
        try {
            await sendTransaction(transaction, connection)
        } catch (err) {
            console.log("err trySendTransaction", err)
        }
    }

    //Send the transaction once it's fetched
    useEffect(() => {
        trySendTransaction()
    }, [transaction])

    //Check every .5s to see if the transaction has completed
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                //Check if there is any transaction for the reference
                const signatureInfo = await findTransactionSignature(connection, reference, {})
                console.log("They Paid!!!")
                router.push('/confirmed')
            } catch (err) {
                if (err instanceof FindTransactionSignatureError) {
                    //No transaction found yet, ignore this error
                    return
                }
                console.error("unknown error", err)
            }
        }, 500)
        return () => {
            clearInterval(interval)
        }
    }, [])

    if (!publicKey) {
        return (
            <div className="flex flex-col gap-8 items-center">
                <BackLink href='/'>Cancel</BackLink>
                <WalletMultiButton/>
                <p>You need to connect your wallet to make transactions</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-8 items-center">
            <BackLink href='/'>Cancel</BackLink>
            <WalletMultiButton/>
            {message ? <div>
                    <p>{message} Please approve the transaction using your wallet</p>
                    <p>Waiting for Approval... <Loading/></p>
            </div> :
                <p>Creating Transaction ... <Loading/></p>}
        </div>
    )
}
