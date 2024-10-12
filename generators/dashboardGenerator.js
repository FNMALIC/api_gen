const fs = require('fs');
const path = require('path');
const { capitalizeFirstLetter } = require('../utils/helpers');

function generateCRUDDashboard(models, pagesFolder) {
    // Debugging step to check the type and value of pagesFolder
    console.log("Type of pagesFolder:", typeof pagesFolder);
    console.log("Value of pagesFolder:", pagesFolder);

    if (typeof pagesFolder !== 'string') {
        throw new TypeError(`Expected pagesFolder to be a string, but received ${typeof pagesFolder}`);
    }

    // Ensure the pages folder exists
    if (!fs.existsSync(pagesFolder)) {
        fs.mkdirSync(pagesFolder, { recursive: true });
    }
    // Shared Layout with Sidebar Component
    const layoutComponent = `
        import React from 'react';
        import { Layout, Menu } from 'antd';
        import { Link } from 'react-router-dom';

        const { Sider, Content } = Layout;

        const Sidebar = () => {
            return (
                <Sider width={200} className="site-layout-background">
                    <Menu
                        mode="inline"
                        defaultSelectedKeys={['dashboard']}
                        style={{ height: '100%', borderRight: 0 }}
                    >
                        <Menu.Item key="dashboard">
                            <Link to="/dashboard">Dashboard</Link>
                        </Menu.Item>
                        ${Object.keys(models)
                          .map(
                            (model) => `
                            <Menu.Item key="${model}">
                                <Link to="/${model}">${capitalizeFirstLetter(model)}</Link>
                            </Menu.Item>
                        `
                          )
                          .join('')}
                    </Menu>
                </Sider>
            );
        };

        const LayoutWithSidebar = ({ children }) => {
            return (
                <Layout style={{ minHeight: '100vh' }}>
                    <Sidebar />
                    <Layout style={{ padding: '24px' }}>
                        <Content>{children}</Content>
                    </Layout>
                </Layout>
            );
        };

        export default LayoutWithSidebar;
    `;

    // Write the shared Layout component to a file
    fs.writeFileSync(path.join(pagesFolder, 'LayoutWithSidebar.tsx'), layoutComponent);

    // Loop through each model and create CRUD pages
    for (const model of Object.keys(models)) {
        const capitalizedModelName = capitalizeFirstLetter(model);

        // Ensure model-specific folder exists
        const modelFolder = path.join(pagesFolder, model);
        if (!fs.existsSync(modelFolder)) {
            fs.mkdirSync(modelFolder, { recursive: true });
        }

        // Create a List Page for each model
        const listPage = `
            import React from 'react';
            import { Table, Button } from 'antd';
            import { use${capitalizedModelName} } from '../hooks/use${capitalizedModelName}';
            import LayoutWithSidebar from '../LayoutWithSidebar';
            import { Link } from 'react-router-dom';

            const ${capitalizedModelName}List = () => {
                const { list } = use${capitalizedModelName}();

                const columns = [
                    ${models[model].map(
                      (field) => `
                    {
                        title: '${capitalizeFirstLetter(field)}',
                        dataIndex: '${field}',
                        key: '${field}',
                    },
                    `
                    ).join('')}
                    {
                        title: 'Action',
                        key: 'action',
                        render: (text, record) => (
                            <span>
                                <Link to={\`/${model}/\${record.id}\`}>Edit</Link>
                                <Button type="link" danger>Delete</Button>
                            </span>
                        ),
                    },
                ];

                return (
                    <LayoutWithSidebar>
                        <h2>${capitalizedModelName} List</h2>
                        <Link to="/${model}/create">
                            <Button type="primary" style={{ marginBottom: 16 }}>Add New ${capitalizedModelName}</Button>
                        </Link>
                        <Table columns={columns} dataSource={list?.data || []} />
                    </LayoutWithSidebar>
                );
            };

            export default ${capitalizedModelName}List;
        `;

        fs.writeFileSync(path.join(modelFolder, `${capitalizedModelName}List.tsx`), listPage);

        // Create a Create Page for each model
        const createPage = `
            import React from 'react';
            import { Form, Input, Button } from 'antd';
            import { use${capitalizedModelName} } from '../hooks/use${capitalizedModelName}';
            import LayoutWithSidebar from '../LayoutWithSidebar';

            const Create${capitalizedModelName} = () => {
                const { create } = use${capitalizedModelName}();

                const onFinish = (values) => {
                    create.mutate(values);
                };

                return (
                    <LayoutWithSidebar>
                        <h2>Create New ${capitalizedModelName}</h2>
                        <Form onFinish={onFinish}>
                            ${models[model].map(
                              (field) => `
                            <Form.Item
                                label="${capitalizeFirstLetter(field)}"
                                name="${field}"
                                rules={[{ required: true, message: 'Please input ${field}!' }]}
                            >
                                <Input />
                            </Form.Item>
                            `
                            ).join('')}
                            <Form.Item>
                                <Button type="primary" htmlType="submit">Create</Button>
                            </Form.Item>
                        </Form>
                    </LayoutWithSidebar>
                );
            };

            export default Create${capitalizedModelName};
        `;

        fs.writeFileSync(path.join(modelFolder, `Create${capitalizedModelName}.tsx`), createPage);

        // Create an Edit Page for each model
        const editPage = `
            import React, { useEffect } from 'react';
            import { Form, Input, Button } from 'antd';
            import { use${capitalizedModelName} } from '../hooks/use${capitalizedModelName}';
            import LayoutWithSidebar from '../LayoutWithSidebar';
            import { useParams } from 'react-router-dom';

            const Edit${capitalizedModelName} = () => {
                const { retrieve, update } = use${capitalizedModelName}();
                const { id } = useParams();
                const [form] = Form.useForm();

                useEffect(() => {
                    retrieve.refetch().then((res) => {
                        form.setFieldsValue(res.data);
                    });
                }, [id]);

                const onFinish = (values) => {
                    update.mutate(values);
                };

                return (
                    <LayoutWithSidebar>
                        <h2>Edit ${capitalizedModelName}</h2>
                        <Form form={form} onFinish={onFinish}>
                            ${models[model].map(
                              (field) => `
                            <Form.Item
                                label="${capitalizeFirstLetter(field)}"
                                name="${field}"
                                rules={[{ required: true, message: 'Please input ${field}!' }]}
                            >
                                <Input />
                            </Form.Item>
                            `
                            ).join('')}
                            <Form.Item>
                                <Button type="primary" htmlType="submit">Save</Button>
                            </Form.Item>
                        </Form>
                    </LayoutWithSidebar>
                );
            };

            export default Edit${capitalizedModelName};
        `;

        fs.writeFileSync(path.join(modelFolder, `Edit${capitalizedModelName}.tsx`), editPage);
    }
}

module.exports = {
    generateCRUDDashboard,
};
