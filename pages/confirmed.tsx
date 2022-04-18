import BackLink from "../components/BackLink";
import PageHeading from "../components/PageHeading";
import Confirmed from "../components/Confirmed";


export default function ConfirmedPage() {
    return (
        <div className='flex flex-col gap-8 items-center'>
            <BackLink href='/'>Home</BackLink>
            <PageHeading>Thank you, enjoy your trip!</PageHeading>
            <div className='h-80 w-80'><Confirmed/></div>
        </div>
    )
}