// DataTable — generic table component using .table-base (scrolls horizontally when narrow)

import React from 'react'

export const DataTable = ({ columns, data }) => (
  <div className="overflow-x-auto">
    <table className="table-base">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col">{col.label}</th>
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
  </div>
)
