import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface Props {
  value:    number
  format?:  (n: number) => string
  duration?: number
}

export function AnimatedNumber({ value, format, duration = 0.75 }: Props) {
  const mv      = useMotionValue(0)
  const display = useTransform(mv, n => {
    const rounded = Math.round(n)
    return format ? format(rounded) : rounded.toLocaleString()
  })

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.25, 0.46, 0.45, 0.94],
    })
    return controls.stop
  }, [value])

  return <motion.span>{display}</motion.span>
}
