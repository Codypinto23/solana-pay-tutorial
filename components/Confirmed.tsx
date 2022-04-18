import {useEffect, useState} from "react";
import {buildStyles, CircularProgressbar, CircularProgressbarWithChildren} from "react-circular-progressbar";
import Confetti from "react-dom-confetti";

const confettiConfig = {
    angle: 90,
    spread: 100,
    startVelocity: 34,
    elementCount: 81,
    dragFriction: 0.11,
    duration: 3000,
    stagger: 3,
    width: "10px",
    height: "10px",
    colors: ["#a864fd", "#29cdff", "#78ff44", "#ff718d", "#fdff6a"]
};


export default function Confirmed() {
    const [percentage, setPercentage] = useState(0)
    const [text, setText] = useState('🎣')
    const [pathColor, setPathColor] = useState("#BF84FC")
    const [done, setDone] = useState(false);


    useEffect(() => {
        const t1 = setTimeout(() => setPercentage(100), 100)
        const t2 = setTimeout(() => {
            setText("✅");
            setPathColor("#00AB00");
            setDone(true)
        }, 600);
        return () => {
            clearTimeout(t1)
            clearTimeout(t2)
        }
    }, [])

    return (
        <CircularProgressbarWithChildren value={percentage} styles={
            buildStyles({
                pathColor,
            })
        }>
            <div style={{textAlign: "center", fontSize: 20}}>
                <div style={{display: "flex"}}>
                    <div style={{marginLeft: "auto", marginRight:"auto"}}>
                        <Confetti active={done} config={confettiConfig}/>
                    </div>
                </div>
                <p style={{fontSize: 20}}>Thank you for your order!</p>
                <p style={{fontSize: 40}}>{text}</p>
            </div>
        </CircularProgressbarWithChildren>
    )

}

