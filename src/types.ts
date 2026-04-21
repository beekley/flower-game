export interface Cell {
  x: number
  y: number
}

export interface Flower extends Cell {
  color: string
  ancestors: Record<string, number>
  age: number
}

export interface GameSystem {
  name: string
  tick(grid: Cell[][], activeCells: Set<Cell>): void
  hasEntity(cell: Cell): boolean
  placeEntity(cell: Cell, brushColor: string | null, activeCells: Set<Cell>): void
  clearEntity(cell: Cell, activeCells: Set<Cell>): void
  drawCell(
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    px: number,
    py: number,
    cellSize: number,
  ): void
  drawCustomBackground?(
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    px: number,
    py: number,
    cellSize: number,
    context: {
      isSelected: boolean
      isHovered: boolean
      selectedCell: { x: number; y: number } | null
      grid: Cell[][]
    },
  ): boolean
  debugItems?: () => Array<{
    label: string
    value: string | number | boolean
    class?: string
    onClick?: () => void
  }>
}
