// DataTable — generic table component using .table-base

import React from 'react'

export const DataTable = ({ columns, data }) => {
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
        {data.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => {
              const value = col.render ? col.render(row) : (col.accessor ? row[col.accessor] : row[col.key])
              return <td key={col.key}>{value}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
