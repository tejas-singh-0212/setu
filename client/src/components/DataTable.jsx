// DataTable — generic table component using .table-base

import React from 'react'

export const DataTable = ({ columns, data, onRowClick }) => {
  return (
    <table className="table-base">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => {
          const handleClick = () => onRowClick && onRowClick(row)
          return (
            <tr key={row.id} onClick={handleClick}>
              {columns.map((col) => {
                const value = col.accessor ? row[col.accessor] : row[col.key]
                return <td key={col.key}>{value}</td>
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}