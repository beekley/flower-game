export interface Flower {
  color: string
  ancestors: Record<string, number>
  age: number
}

export type FlowerSpawn = Flower & { x: number; y: number }

export interface Cell {
  x: number
  y: number
  flower: Flower | null
}
