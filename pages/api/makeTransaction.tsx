import {NextApiRequest, NextApiResponse} from "next";
import calculatePrice from "../../lib/calculatePrice";
import {
    clusterApiUrl,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction
} from "@solana/web3.js";
import {couponAddress, shopAddress, usdcAddress} from "../../lib/addresses";
import {WalletAdapterNetwork} from "@solana/wallet-adapter-base";
import {
    createTransferCheckedInstruction,
    getAssociatedTokenAddress,
    getMint,
    getOrCreateAssociatedTokenAccount
} from "@solana/spl-token";
import base58 from "bs58";


export type MakeTransactionInputData = {
    account: string
}

type MakeTransactionGetResponse = {
    label: string,
    icon: string
}

export type MakeTranscationOutputData = {
    transaction: string,
    message: string
}

type ErrorOutput = {
    error: string
}


function get(res: NextApiResponse<MakeTransactionGetResponse>) {
    res.status(200).json({
        label: "GUIDE-X Solana",
        icon: 'https://guidex-image-storage.nyc3.digitaloceanspaces.com/crypto/trout-crypto-key.svg'
    })
}


async function post(
    req: NextApiRequest,
    res: NextApiResponse<MakeTranscationOutputData | ErrorOutput>
) {
    try {
        // We pass the selected items in the query, calculate the expected cost
        const amount = calculatePrice(req.query)
        if (amount.toNumber() === 0) {
            res.status(400).json({error: "Cant checkout with charge of 0"})
            return
        }
        //We pass the reference to the query
        // A reference is a new Solana Public Key that we'll generate on the checkout page
        const {reference} = req.query
        if (!reference) {
            res.status(400).json({error: "No reference Provided"})
            return
        }

        //We pass the buyer's public key in  JSON body
        const {account} = req.body as MakeTransactionInputData
        if (!account) {
            res.status(400).json({error: "No account provided"})
        }

        //We get the shop private key from the .env - this is the same as in our script
        const shopPrivateKey= process.env.SHOP_PRIVATE_KEY as string
        if (!shopPrivateKey){
            res.status(500).json({error:"Shop private key not available"})
        }
        const shopKeypair= Keypair.fromSecretKey(base58.decode(shopPrivateKey))


        const buyerPublicKey = new PublicKey(account)
        const shopPublicKey = shopKeypair.publicKey

        const network = WalletAdapterNetwork.Testnet
        const endpoint = clusterApiUrl(network)
        const connection = new Connection(endpoint)

        //Get the buyer and seller coupon token accounts
        // Buyer one may not exist, so we create it (which costs SOL) as the shop account if it doesnt
        const buyerCouponAddress= await getOrCreateAssociatedTokenAccount(
            connection,
            shopKeypair, //shop pays the fee to create it
            couponAddress, //which token the account is for
            buyerPublicKey, // who the token account belongs to
        ).then(account=>account.address)

        console.log("buyerCouponAddress",buyerCouponAddress)
        const shopCouponAddress= await getAssociatedTokenAddress(couponAddress,shopPublicKey)

        //Get the details about the USDC Token-- gets the metadata
        const usdcMint = await getMint(connection, usdcAddress)
        // Get the buyer's USDC token account address-- different from other blockchains
        // The Solana contract itself is stateless, and it generates accounts to hold the data
        //So we're getting the addresses for the buyer and shop
        const buyerUsdcAddress = await getAssociatedTokenAddress(usdcAddress, buyerPublicKey)
        //Get the shops USDC Token account address
        const shopUsdcAddress = await getAssociatedTokenAddress(usdcAddress, shopPublicKey)

        //Get a recent blockhash to include in the transaction
        //We do this because a transaction should only be valid for a short time. We want it on the latest block of the network
        // the transaction can be rejected if that is too old
        const {blockhash} = await (connection.getLatestBlockhash('finalized'))

        //We creating a new Solana Transaction here. Were setting the buyer as the fee payer, which means the buyer
        // must sign the transaction before it is processed by the network
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            //The buyer pays the transaction fee
            feePayer: buyerPublicKey
        })

        //Create the instruction to send SOL from the buyer to the Shop
        //Lamports are fractions of a SOL, hence why we need BigNumber
        // Transfer instructions expect lamports. There are 1 billions lamports in 1 SOL, so use the constant LAMPORTS_PER_SOL when converting
        // between them
        /*  const transferInstruction = SystemProgram.transfer({
              fromPubkey: buyerPublicKey,
              lamports: amount.multipliedBy(LAMPORTS_PER_SOL).toNumber(),
              toPubkey: shopPublicKey
          })*/

        //Create the instruction to send USDC from the buyer to the shop
        //Instead of using lamports, we need to use the units for the token. Safest way is to multiply by (10 ** decimals) that we
        // fetch from the  mint metadata
        //Note here the buyerPublicKey will be the signer key, because we need their authority to transfer USDC from their USDC account
        const transferInstruction = createTransferCheckedInstruction(
            buyerUsdcAddress, //source
            usdcAddress, //mint (token address)
            shopUsdcAddress, //destination
            buyerPublicKey, //owner of source address
            amount.toNumber() * (10 ** (await usdcMint).decimals), //amount to transfer (in units of USDC token)
            usdcMint.decimals, //decimals of the USDC token
        )

        //Add the reference to the instruction as a key
        //This will mean that this transaction is returned when we query for the reference
        // by adding it to our instruction we're able to look the transaction up with this reference
        // This will allow our checkout page to see that a payment has been made
        // The Buyer here is a Signer and Writeable because they are giving authority by signing, and their SOL balance will change
        // The Shop here is just a Writer, because their SOL balance will change
        transferInstruction.keys.push({
            pubkey: new PublicKey(reference),
            isSigner: false,
            isWritable: false
        })
        console.log("transferInstruction 1",transferInstruction)


        // Create the instruction to send the coupon from the shop to the buyer
        const couponInstruction= createTransferCheckedInstruction(
            shopCouponAddress, //source account (coupon)
            couponAddress, // token address (coupon)
            buyerCouponAddress, //destination account (coupon)
            shopPublicKey, //own of source account
            1, //amount to transfer
            0, //decimals of the token
        )
        console.log("couponInstruction 1",couponInstruction)

        //Add both instructions to the transaction
        transaction.add(transferInstruction, couponInstruction)

        //Sign the transaction as the shop, which is required to transfer the coupon
        // We must partial sign because the transfer instruction still requires the user
        //This actually adds some extra security, because now no one can modify this transaction without invalidating the shop's signature
        //As such, when we're reviewing the ecommerce transactions, we don't need to check the transaction details, we just need to check we've signed it
        transaction.partialSign(shopKeypair)
        console.log("transaction 1",transaction)
        //Serialize the transaction and convert to base64 to return it
        // This wil allow us to return it from the API and consume it on the checkout page
        // We pass requireAllSignatures: false when we serialize it, because our transaction requires the Buyer's Sig, and we
        // dont have they yet. Will aks for it from their connected wallet on the checkout page
        const serializedTransaction = transaction.serialize({
            //We will need the buyer to sign this transaction after its returned to them
            requireAllSignatures: false //This means that we require all signatures to be present
        })
        const base64 = serializedTransaction.toString('base64')
        console.log("base64 1",base64)

        //TODO: Insert into Database the reference and amount
        //In reality you’d want to record this transaction in a database as part of the API call.

        //Return the serialized transaction
        res.status(200).json({
            transaction: base64,
            message: "Thanks for your order ! 🎣"
        })

    } catch (err) {
        console.log("makeTransaction err", err)
        res.status(500).json({error: 'error creating transaction'})
        return
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<MakeTransactionGetResponse | MakeTranscationOutputData | ErrorOutput>
) {
    if (req.method === "GET") {
        return get(res)
    } else if (req.method === "POST") {
        return await post(req, res)
    } else {
        return res.status(405).json({error: "Method not allowed"})
    }
}